// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IRulesModule.sol";
import "./IYieldModule.sol";



/// @title OpenEscrowCore - Core escrow contract for rental deposits
/// @notice Modular structure with support for rules and yield modules
contract OpenEscrowCore {

    /// @notice Main data structure to track each escrow
    struct EscrowAgreement {
        address tenant;          // Person who initiates the escrow and sends the funds
        address landlord;        // Receiver of the funds once the release condition is met
        uint256 amount;          // Amount held in escrow
        uint256 releaseTime;     // Timestamp after which funds can be released
        bool released;           // Flag to prevent double release
        bool refunded;           // Flag to track if refund was triggered
        address rulesModule;     // External logic module (e.g. dispute rules, validators)
        address yieldModule;     // External module for optional yield generation
    }

    // Mapping storing all escrow agreements by ID
    mapping(uint256 => EscrowAgreement) public agreements;

    // Global counter for agreement IDs (auto-incremented)
    uint256 public nextAgreementId;

    // Events for front-end and off-chain monitoring
    event AgreementCreated(uint256 indexed id, address tenant, address landlord, uint256 amount);
    event FundsDeposited(uint256 indexed id, uint256 amount);
    event FundsReleased(uint256 indexed id);
    event FundsRefunded(uint256 indexed id);

    /// @notice Modifier to restrict actions to the tenant of a given agreement
    modifier onlyTenant(uint256 _id) {
        require(msg.sender == agreements[_id].tenant, "Only tenant");
        _;
    }

    /// @notice Tenant calls this function to create a new escrow and send ETH
    /// @param _landlord The recipient of the funds once released
    /// @param _releaseTime Timestamp after which funds can be released
    /// @param _rulesModule Address of optional rules module (can be zero address)
    /// @param _yieldModule Address of optional yield module (can be zero address)
    function createAgreement(
        address _landlord,
        uint256 _releaseTime,
        address _rulesModule,
        address _yieldModule
    ) external payable returns (uint256){
        require(msg.value > 0, "Must send some ETH");
        require(_landlord != address(0), "Invalid landlord address");
        require(_releaseTime > block.timestamp, "Release time must be in the future");

        uint256 id = nextAgreementId++;

        // Store the agreement
        agreements[id] = EscrowAgreement({
            tenant: msg.sender,
            landlord: _landlord,
            amount: msg.value,
            releaseTime: _releaseTime,
            released: false,
            refunded: false,
            rulesModule: _rulesModule,
            yieldModule: _yieldModule
        });

        // Emit events for UI / monitoring
        emit AgreementCreated(id, msg.sender, _landlord, msg.value);
        emit FundsDeposited(id, msg.value);

        return id;
    }

    /// @notice Releases funds to the landlord after the release time has passed
    /// @dev Can be triggered by anyone (tenant, validator, or automation later)
    function releaseFunds(uint256 _agreementId) external {
        EscrowAgreement storage agreement = agreements[_agreementId];

        require(!agreement.released, "Already released");
        require(!agreement.refunded, "Already refunded");
        require(block.timestamp >= agreement.releaseTime, "Too early to release");

     // Optional validation via rulesModule
        if (agreement.rulesModule != address(0)) {
            bool approved = IRulesModule(agreement.rulesModule).validateRelease(_agreementId);
            require(approved, "Release blocked by rules module");
        }

        agreement.released = true;

        // Transfer funds to landlord
        (bool success, ) = agreement.landlord.call{value: agreement.amount}("");
        require(success, "Transfer failed");

        emit FundsReleased(_agreementId);

     // Handle yield module if defined
        if (agreement.yieldModule != address(0)) {
            (uint256 tenantShare, ) = IYieldModule(agreement.yieldModule).claimYield(_agreementId);

            if (tenantShare > 0) {
                (bool okTenant, ) = agreement.tenant.call{value: tenantShare}("");
                require(okTenant, "Yield transfer to tenant failed");
            }
        }


    }

    /// @notice Allows the tenant to reclaim the deposit if funds haven't been released
    /// @dev Only callable by the original tenant and only after the release time
    function refund(uint256 _agreementId) external onlyTenant(_agreementId) {
        EscrowAgreement storage agreement = agreements[_agreementId];

        require(!agreement.released, "Already released");
        require(!agreement.refunded, "Already refunded");
        require(block.timestamp >= agreement.releaseTime, "Too early to refund");

        agreement.refunded = true;

        // Claim yield if module present
        uint256 yieldAmount = 0;
        if (address(agreement.yieldModule) != address(0)) {
            (uint256 tenantShare, ) = IYieldModule(agreement.yieldModule).claimYield(_agreementId);
            yieldAmount = tenantShare;
        }
        uint256 totalRefund = agreement.amount + yieldAmount;


        // Send the full amount + yield back to the tenant
        (bool success, ) = agreement.tenant.call{value: totalRefund}("");
        require(success, "Refund transfer failed");

        emit FundsRefunded(_agreementId);

    }
}
