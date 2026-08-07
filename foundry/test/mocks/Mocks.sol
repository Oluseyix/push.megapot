// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockUSDC {
    string public name = "USD Coin";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

struct Push_StaticTicket {
    uint8[] normals;
    uint8 bonusball;
}

/// @dev Mimics JackpotRandomTicketBuyer's real behavior closely enough for
/// unit tests: pulls exactly count * $1 from the caller and records the
/// purchase. Real contract caps count at 10 - this mock enforces that too so
/// tests catch a Push bug that tries to route a >10 order here by mistake.
contract MockRandomTicketBuyer {
    uint256 constant TICKET_PRICE = 1_000_000;
    MockUSDC public usdc;

    address public lastRecipient;
    uint256 public lastCount;
    uint256 public callCount;

    constructor(MockUSDC _usdc) {
        usdc = _usdc;
    }

    function buyTickets(
        uint256 _count,
        address _recipient,
        address[] calldata,
        uint256[] calldata,
        bytes32
    ) external returns (uint256[] memory ticketIds) {
        require(_count >= 1 && _count <= 10, "InvalidTicketCount");
        require(usdc.transferFrom(msg.sender, address(this), _count * TICKET_PRICE), "usdc pull failed");
        lastRecipient = _recipient;
        lastCount = _count;
        callCount += 1;
        ticketIds = new uint256[](_count);
    }
}

/// @dev Mimics BatchPurchaseFacilitator closely enough for unit tests: pulls
/// count * $1, enforces the real one-active-order-per-recipient constraint,
/// and enforces the real >=10 minimum.
contract MockBatchFacilitator {
    uint256 constant TICKET_PRICE = 1_000_000;
    MockUSDC public usdc;

    mapping(address => bool) public hasActiveBatchOrder;
    address public lastRecipient;
    uint256 public lastDynamicCount;
    uint256 public callCount;

    constructor(MockUSDC _usdc) {
        usdc = _usdc;
    }

    function minimumTicketCount() external pure returns (uint256) {
        return 10;
    }

    function createBatchOrder(
        address _recipient,
        uint64 _dynamicTicketCount,
        Push_StaticTicket[] calldata _userStaticTickets,
        address[] calldata,
        uint256[] calldata,
        bytes32
    ) external {
        require(!hasActiveBatchOrder[_recipient], "ActiveBatchOrderExists");
        uint256 total = uint256(_dynamicTicketCount) + _userStaticTickets.length;
        require(total >= 10, "InvalidTicketCount");
        require(usdc.transferFrom(msg.sender, address(this), total * TICKET_PRICE), "usdc pull failed");
        hasActiveBatchOrder[_recipient] = true;
        lastRecipient = _recipient;
        lastDynamicCount = _dynamicTicketCount;
        callCount += 1;
    }

    /// @dev Test helper only - simulates the keeper finishing execution so
    /// a later round for the same player isn't blocked forever in tests.
    function simulateKeeperCompletion(address recipient) external {
        hasActiveBatchOrder[recipient] = false;
    }
}
