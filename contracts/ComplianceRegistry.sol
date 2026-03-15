// SPDX-License-Identifier: MIT
// DPO2U Compliance Protocol — Monad Network (PRD v3)
// ECA Digital (Lei 15.211) + LGPD (Lei 13.709) compliant
// ZK-native architecture: Circom/Groth16 proofs verified on-chain
pragma solidity ^0.8.20;

interface IVerifier {
    function verifyProof(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[2] calldata input
    ) external view returns (bool);
}

contract ComplianceRegistry {
    struct AgeRecord {
        bool    is_adult;
        uint256 timestamp;
        uint256 proof_year;
    }

    mapping(address => AgeRecord) private registry;

    IVerifier public verifier;
    address public owner;

    event AdultVerified   (address indexed subject, uint256 proof_year);
    event ComplianceQueried(address indexed subject, bool result);
    event AdultRevoked    (address indexed subject, string reason);

    modifier onlyOwner() { require(msg.sender == owner, "DPO2U: only owner"); _; }

    constructor(address _verifier) {
        owner    = msg.sender;
        verifier = IVerifier(_verifier);
    }

    /// @dev Anyone can submit a ZK proof to register as adult
    function submitProof(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[2] calldata input
    ) external {
        // input[0] = is_adult (circuit output), input[1] = current_year (public input)
        uint256 is_adult_bit = input[0];
        uint256 year = input[1];

        require(year >= 2024 && year <= 2030, "DPO2U: year out of range");
        require(is_adult_bit == 1, "DPO2U: not adult");
        require(verifier.verifyProof(a, b, c, input), "DPO2U: invalid proof");

        registry[msg.sender] = AgeRecord({
            is_adult:   true,
            timestamp:  block.timestamp,
            proof_year: year
        });

        emit AdultVerified(msg.sender, year);
    }

    /// @dev Main function — any dApp checks age compliance
    function isAdult(address subject) external returns (bool) {
        bool result = registry[subject].is_adult;
        emit ComplianceQueried(subject, result);
        return result;
    }

    /// @dev Full regulatory audit record
    function getRecord(address subject) external view returns (AgeRecord memory) {
        return registry[subject];
    }

    /// @dev LGPD Art. 18 — right to rectification
    function revokeAdult(address subject, string calldata reason) external onlyOwner {
        registry[subject].is_adult = false;
        emit AdultRevoked(subject, reason);
    }

    function setVerifier(address _v) external onlyOwner {
        verifier = IVerifier(_v);
    }
}
