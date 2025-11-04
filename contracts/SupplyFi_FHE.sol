pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract EncryptedFinanceProtocol is ZamaEthereumConfig {
    struct FinanceRequest {
        string supplierId;
        euint32 encryptedAmount;
        uint256 publicCreditScore;
        uint256 publicOrderCount;
        string invoiceReference;
        address requester;
        uint256 timestamp;
        uint32 decryptedAmount;
        bool isVerified;
    }

    mapping(string => FinanceRequest) public financeRequests;
    string[] public requestIds;

    event FinanceRequestCreated(string indexed requestId, address indexed requester);
    event DecryptionVerified(string indexed requestId, uint32 decryptedAmount);

    constructor() ZamaEthereumConfig() {}

    function createFinanceRequest(
        string calldata requestId,
        string calldata supplierId,
        externalEuint32 encryptedAmount,
        bytes calldata inputProof,
        uint256 publicCreditScore,
        uint256 publicOrderCount,
        string calldata invoiceReference
    ) external {
        require(bytes(financeRequests[requestId].supplierId).length == 0, "Request already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedAmount, inputProof)), "Invalid encrypted input");

        financeRequests[requestId] = FinanceRequest({
            supplierId: supplierId,
            encryptedAmount: FHE.fromExternal(encryptedAmount, inputProof),
            publicCreditScore: publicCreditScore,
            publicOrderCount: publicOrderCount,
            invoiceReference: invoiceReference,
            requester: msg.sender,
            timestamp: block.timestamp,
            decryptedAmount: 0,
            isVerified: false
        });

        FHE.allowThis(financeRequests[requestId].encryptedAmount);
        FHE.makePubliclyDecryptable(financeRequests[requestId].encryptedAmount);
        requestIds.push(requestId);

        emit FinanceRequestCreated(requestId, msg.sender);
    }

    function verifyDecryption(
        string calldata requestId,
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(bytes(financeRequests[requestId].supplierId).length > 0, "Request does not exist");
        require(!financeRequests[requestId].isVerified, "Data already verified");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(financeRequests[requestId].encryptedAmount);

        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);
        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));

        financeRequests[requestId].decryptedAmount = decodedValue;
        financeRequests[requestId].isVerified = true;

        emit DecryptionVerified(requestId, decodedValue);
    }

    function getEncryptedAmount(string calldata requestId) external view returns (euint32) {
        require(bytes(financeRequests[requestId].supplierId).length > 0, "Request does not exist");
        return financeRequests[requestId].encryptedAmount;
    }

    function getFinanceRequest(string calldata requestId) external view returns (
        string memory supplierId,
        uint256 publicCreditScore,
        uint256 publicOrderCount,
        string memory invoiceReference,
        address requester,
        uint256 timestamp,
        bool isVerified,
        uint32 decryptedAmount
    ) {
        require(bytes(financeRequests[requestId].supplierId).length > 0, "Request does not exist");
        FinanceRequest storage data = financeRequests[requestId];

        return (
            data.supplierId,
            data.publicCreditScore,
            data.publicOrderCount,
            data.invoiceReference,
            data.requester,
            data.timestamp,
            data.isVerified,
            data.decryptedAmount
        );
    }

    function getAllRequestIds() external view returns (string[] memory) {
        return requestIds;
    }

    function evaluateFinancing(
        string calldata requestId,
        euint32 encryptedThreshold,
        bytes calldata thresholdProof
    ) external view returns (bool) {
        require(bytes(financeRequests[requestId].supplierId).length > 0, "Request does not exist");
        require(FHE.isInitialized(FHE.fromExternal(encryptedThreshold, thresholdProof)), "Invalid threshold");

        euint32 threshold = FHE.fromExternal(encryptedThreshold, thresholdProof);
        return FHE.greaterThanOrEqual(financeRequests[requestId].encryptedAmount, threshold);
    }

    function isOperational() public pure returns (bool) {
        return true;
    }
}

