/* @flow */
import { validateParams } from './paramsValidator';
import { validatePath } from '../../../utils/pathUtils';

import { ERRORS } from '../../../constants';
import type { IDevice } from '../../../device/Device';

import type { CardanoAddressParametersType } from '../../../types/trezor/protobuf';
import { CardanoAddressType } from '../../../types/networks/cardano';
import type { CardanoAddressParameters } from '../../../types/networks/cardano';

export const validateAddressParameters = (addressParameters: CardanoAddressParameters) => {
    validateParams(addressParameters, [
        { name: 'addressType', type: 'number', obligatory: true },
        { name: 'stakingKeyHash', type: 'string' },
        { name: 'paymentScriptHash', type: 'string' },
        { name: 'stakingScriptHash', type: 'string' },
    ]);

    if (addressParameters.path) {
        validatePath(addressParameters.path);
    }
    if (addressParameters.stakingPath) {
        validatePath(addressParameters.stakingPath);
    }

    if (addressParameters.certificatePointer) {
        validateParams(addressParameters.certificatePointer, [
            { name: 'blockIndex', type: 'number', obligatory: true },
            { name: 'txIndex', type: 'number', obligatory: true },
            { name: 'certificateIndex', type: 'number', obligatory: true },
        ]);
    }
};

export const modifyAddressParametersForBackwardsCompatibility = (
    device: IDevice,
    address_parameters: CardanoAddressParametersType,
): CardanoAddressParametersType => {
    if (address_parameters.address_type === CardanoAddressType.REWARD) {
        // older firmware expects reward address path in path field instead of staking path
        let { address_n, address_n_staking } = address_parameters;

        if (address_n.length > 0 && address_n_staking.length > 0) {
            throw ERRORS.TypedError(
                'Method_InvalidParameter',
                `Only stakingPath is allowed for CardanoAddressType.REWARD`,
            );
        }

        if (device.atLeast(['0', '2.4.3'])) {
            if (address_n.length > 0) {
                address_n_staking = address_n;
                address_n = [];
            }
        } else if (address_n_staking.length > 0) {
            address_n = address_n_staking;
            address_n_staking = [];
        }

        return {
            ...address_parameters,
            address_n,
            address_n_staking,
        };
    }

    return address_parameters;
};

export const addressParametersToProto = (
    addressParameters: CardanoAddressParameters,
): CardanoAddressParametersType => {
    let path = [];
    if (addressParameters.path) {
        path = validatePath(addressParameters.path, 3);
    }

    let stakingPath = [];
    if (addressParameters.stakingPath) {
        stakingPath = validatePath(addressParameters.stakingPath, 3);
    }

    let certificatePointer;
    if (addressParameters.certificatePointer) {
        certificatePointer = {
            block_index: addressParameters.certificatePointer.blockIndex,
            tx_index: addressParameters.certificatePointer.txIndex,
            certificate_index: addressParameters.certificatePointer.certificateIndex,
        };
    }

    return {
        address_type: addressParameters.addressType,
        address_n: path,
        address_n_staking: stakingPath,
        staking_key_hash: addressParameters.stakingKeyHash,
        certificate_pointer: certificatePointer,
        script_payment_hash: addressParameters.paymentScriptHash,
        script_staking_hash: addressParameters.stakingScriptHash,
    };
};

export const addressParametersFromProto = (
    addressParameters: CardanoAddressParametersType,
): CardanoAddressParameters => {
    let certificatePointer;
    if (addressParameters.certificate_pointer) {
        certificatePointer = {
            blockIndex: addressParameters.certificate_pointer.block_index,
            txIndex: addressParameters.certificate_pointer.tx_index,
            certificateIndex: addressParameters.certificate_pointer.certificate_index,
        };
    }

    return {
        addressType: addressParameters.address_type,
        path: addressParameters.address_n,
        stakingPath: addressParameters.address_n_staking,
        stakingKeyHash: addressParameters.staking_key_hash,
        certificatePointer,
    };
};
