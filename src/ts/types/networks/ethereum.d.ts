// Ethereum types
// https://github.com/ethereumjs/ethereumjs-tx

// get address

export interface EthereumGetAddress {
    path: string | number[];
    address?: string;
    showOnTrezor?: boolean;
}

export interface EthereumAddress {
    address: string;
    path: number[];
    serializedPath: string;
}

// get public key

export interface EthereumGetPublicKey {
    path: string | number[];
    showOnTrezor?: boolean;
}

// sign transaction

export interface EthereumTransaction {
    to: string;
    value: string;
    gasPrice: string;
    gasLimit: string;
    maxFeePerGas?: typeof undefined;
    maxPriorityFeePerGas?: typeof undefined;
    nonce: string;
    data?: string;
    chainId: number;
    txType?: number;
}

export type EthereumAccessList = {
    address: string;
    storageKeys: string[];
};

export type EthereumTransactionEIP1559 = {
    to: string;
    value: string;
    gasLimit: string;
    gasPrice?: typeof undefined;
    nonce: string;
    data?: string;
    chainId: number;
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
    accessList?: EthereumAccessList[];
};

export interface EthereumSignTransaction {
    path: string | number[];
    transaction: EthereumTransaction | EthereumTransactionEIP1559;
}

export interface EthereumSignedTx {
    v: string;
    r: string;
    s: string;
}

// sign message

export interface EthereumSignMessage {
    path: string | number[];
    message: string;
    hex?: boolean;
}

// sign typed message (eip-712)

interface EthereumSignTypedDataTypeProperty {
    name: string;
    type: string;
}

interface EthereumSignTypedDataTypes {
    EIP712Domain: EthereumSignTypedDataTypeProperty[];
    [additionalProperties: string]: EthereumSignTypedDataTypeProperty[];
}

interface EthereumSignTypedDataMessage<T extends EthereumSignTypedDataTypes> {
    types: T;
    primaryType: keyof T;
    domain: {
        name?: string;
        version?: string;
        chainId?: number | bigint;
        verifyingContract?: string;
        salt?: ArrayBuffer;
    };
    message: { [fieldName: string]: any };
}

export interface EthereumSignTypedData<T extends EthereumSignTypedDataTypes> {
    path: string | number[];
    data: EthereumSignTypedDataMessage<T>;
    metamask_v4_compat: boolean;
}

// verify message

export interface EthereumVerifyMessage {
    address: string;
    message: string;
    hex?: boolean;
    signature: string;
}
