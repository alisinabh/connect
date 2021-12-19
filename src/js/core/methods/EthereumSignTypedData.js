/* @flow */

const sigUtil = require('@metamask/eth-sig-util');

import AbstractMethod from './AbstractMethod';
import { validateParams, getFirmwareRange } from './helpers/paramsValidator';
import { validatePath } from '../../utils/pathUtils';
import { getEthereumNetwork } from '../../data/CoinInfo';
import { toChecksumAddress, getNetworkLabel } from '../../utils/ethereumUtils';
import type { EthereumNetworkInfo } from '../../types';
import type { MessageResponse, EthereumTypedDataStructAck } from '../../types/trezor/protobuf';
import { ERRORS } from '../../constants';
import type { EthereumSignTypedData as EthereumSignTypedDataParams } from '../../types/networks/ethereum';
import { getFieldType, parseArrayType, encodeData } from './helpers/ethereumSignTypedData';

type Params = {
    ...EthereumSignTypedDataParams,
    path: number[],
    network?: EthereumNetworkInfo,
};

// Sanitization is used for T1 as eth-sig-util does not support BigInt
function sanitizeData(data) {
  switch(Object.prototype.toString.call(data)) {
    case '[object Object]':
      let entries = Object.keys(data).map((k) => [k, sanitizeData(data[k])]);
      return Object.fromEntries(entries);

    case '[object Array]':
      return data.map((v) => sanitizeData(v));

    case '[object BigInt]':
      return data.toString();

    default:
      return data;
  }
}

export default class EthereumSignTypedData extends AbstractMethod<'ethereumSignTypedData'> {
    params: Params;

    init() {
        this.requiredPermissions = ['read', 'write'];

        const { payload } = this;

        // validate incoming parameters
        validateParams(payload, [
            { name: 'path', required: true },
            { name: 'data', type: 'object', required: true },
            { name: 'metamask_v4_compat', type: 'boolean', required: true },
        ]);

        const path = validatePath(payload.path, 3);
        const network = getEthereumNetwork(path);
        this.firmwareRange = getFirmwareRange(this.name, network, this.firmwareRange);

        this.info = getNetworkLabel('Sign #NETWORK typed data', network);

        const { data, metamask_v4_compat } = payload;

        this.params = {
            path,
            network,
            data,
            metamask_v4_compat,
        };
    }

    async run() {
        const cmd = this.device.getCommands();
        const { path: address_n, network, data, metamask_v4_compat } = this.params;

        const { types, primaryType, domain, message } = sigUtil.TypedDataUtils.sanitizeData(data);

        let response: MessageResponse<
            | 'EthereumTypedDataStructRequest'
            | 'EthereumTypedDataValueRequest'
            | 'EthereumTypedDataSignature',
        >;

        if (this.device.features.model === '1') {
          // For Model 1 we use EthereumSignTypedHash
          const version = metamask_v4_compat ?
            sigUtil.SignTypedDataVersion.V4 : sigUtil.SignTypedDataVersion.V3

          const domainSeparatorHash =  sigUtil.TypedDataUtils.hashStruct(
            'EIP712Domain',
            sanitizeData(domain),
            types,
            version,
          ).toString('hex');

          const messageHash = sigUtil.TypedDataUtils.hashStruct(
            primaryType,
            sanitizeData(message),
            types,
            version,
          ).toString('hex');

          response = await cmd.typedCall(
            'EthereumSignTypedHash',
            'EthereumTypedDataSignature',
            {
              address_n,
              domain_separator_hash: domainSeparatorHash,
              message_hash: messageHash
            },
          );
        } else {
          // For Model T we use EthereumSignTypedData
          response = await cmd.typedCall(
            'EthereumSignTypedData',
            // $FlowIssue typedCall problem with unions in response, TODO: accept unions
            'EthereumTypedDataStructRequest|EthereumTypedDataValueRequest|EthereumTypedDataSignature',
            {
                address_n,
                primary_type: primaryType,
                metamask_v4_compat,
            },
          );
        }

        // sending all the type data
        while (response.type === 'EthereumTypedDataStructRequest') {
            // $FlowIssue disjoint union Refinements not working, TODO: check if new Flow versions fix this
            const { name: typeDefinitionName } = response.message;
            const typeDefinition = types[typeDefinitionName];
            if (typeDefinition === undefined) {
                throw ERRORS.TypedError(
                    'Runtime',
                    `Type ${typeDefinitionName} was not defined in types object`,
                );
            }
            const dataStruckAck: EthereumTypedDataStructAck = {
                members: typeDefinition.map(({ name, type: typeName }) => ({
                    name,
                    type: getFieldType(typeName, types),
                })),
            };
            response = await cmd.typedCall(
                'EthereumTypedDataStructAck',
                // $FlowIssue typedCall problem with unions in response, TODO: accept unions
                'EthereumTypedDataStructRequest|EthereumTypedDataValueRequest|EthereumTypedDataSignature',
                dataStruckAck,
            );
        }

        // sending the whole message to be signed
        while (response.type === 'EthereumTypedDataValueRequest') {
            // $FlowIssue disjoint union Refinements not working, TODO: check if new Flow versions fix this
            const { member_path } = response.message;

            let memberData;
            let memberTypeName;

            const [rootIndex, ...nestedMemberPath] = member_path;
            switch (rootIndex) {
                case 0:
                    memberData = domain;
                    memberTypeName = 'EIP712Domain';
                    break;
                case 1:
                    memberData = message;
                    memberTypeName = primaryType;
                    break;
                default:
                    throw ERRORS.TypedError('Runtime', 'Root index can only be 0 or 1');
            }

            // It can be asking for a nested structure (the member path being [X, Y, Z, ...])
            for (const index of nestedMemberPath) {
                if (Array.isArray(memberData)) {
                    memberTypeName = parseArrayType(memberTypeName).entryTypeName;
                    memberData = memberData[index];
                } else if (typeof memberData === 'object' && memberData !== null) {
                    const memberTypeDefinition = types[memberTypeName][index];
                    memberTypeName = memberTypeDefinition.type;
                    memberData = memberData[memberTypeDefinition.name];
                } else {
                    // TODO: what to do when the value is missing (for example in recursive types)?
                }
            }

            let encodedData;
            // If we were asked for a list, first sending its length and we will be receiving
            // requests for individual elements later
            if (Array.isArray(memberData)) {
                // Sending the length as uint16
                encodedData = encodeData('uint16', memberData.length);
            } else {
                encodedData = encodeData(memberTypeName, memberData);
            }

            // $FlowIssue with `await` and Promises: https://github.com/facebook/flow/issues/5294, TODO: Update flow
            response = await cmd.typedCall(
                'EthereumTypedDataValueAck',
                // $FlowIssue typedCall problem with unions in response, TODO: accept unions
                'EthereumTypedDataValueRequest|EthereumTypedDataSignature',
                {
                    value: encodedData,
                },
            );
        }

        // $FlowIssue disjoint union Refinements not working, TODO: check if new Flow versions fix this
        const { address, signature } = response.message;
        return {
            address: toChecksumAddress(address, network),
            signature: `0x${signature}`,
        };
    }
}
