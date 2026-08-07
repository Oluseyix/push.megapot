// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DrawingState, BatchOrderInfo, StaticTicket} from "../../src/Push.sol";

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

/// @dev Mimics Jackpot.getDrawingState()/.currentDrawingId() closely enough
/// for unit tests - just the live ticket price Push actually reads, settable
/// per test. Confirmed against megapot-starter-kit's useJackpotState.ts.
contract MockJackpot {
    uint256 public currentDrawingId = 1;
    uint256 public ticketPrice = 1_000_000; // $1 USDC, 6 decimals - matches Megapot's real default

    function setTicketPrice(uint256 _price) external {
        ticketPrice = _price;
    }

    function getDrawingState(uint256) external view returns (DrawingState memory) {
        return DrawingState({
            prizePool: 0,
            ticketPrice: ticketPrice,
            edgePerTicket: 0,
            referralWinShare: 0,
            referralFee: 0,
            globalTicketsBought: 0,
            lpEarnings: 0,
            drawingTime: 0,
            winningTicket: 0,
            ballMax: 30,
            bonusballMax: 1,
            payoutCalculator: address(0),
            jackpotLock: false
        });
    }
}

/// @dev Mimics BatchPurchaseFacilitator closely enough for unit tests: pulls
/// count * live ticket price, and enforces the real one-active-order-per-
/// recipient constraint via remainingTickets (see Push.sol's
/// BatchOrderInfo/IBatchPurchaseFacilitator comments for why - there's no
/// separate hasActiveBatchOrder() getter or confirmed minimumTicketCount()
/// on the real contract, so this mock doesn't invent one either).
contract MockBatchFacilitator {
    MockUSDC public usdc;
    uint256 public ticketPrice = 1_000_000; // kept in sync with MockJackpot's by tests that change it

    mapping(address => BatchOrderInfo) private orders;
    address public lastRecipient;
    uint256 public lastDynamicCount;
    uint256 public callCount;

    constructor(MockUSDC _usdc) {
        usdc = _usdc;
    }

    function setTicketPrice(uint256 _price) external {
        ticketPrice = _price;
    }

    function createBatchOrder(
        address _recipient,
        uint64 _dynamicTicketCount,
        StaticTicket[] calldata _userStaticTickets,
        address[] calldata,
        uint256[] calldata,
        bytes32
    ) external {
        require(orders[_recipient].remainingTickets == 0, "ActiveBatchOrderExists");
        uint256 total = uint256(_dynamicTicketCount) + _userStaticTickets.length;
        require(total > 0, "InvalidTicketCount");
        uint256 cost = total * ticketPrice;
        require(usdc.transferFrom(msg.sender, address(this), cost), "usdc pull failed");

        orders[_recipient] = BatchOrderInfo({
            orderDrawingId: 0,
            // forge-lint: disable-next-line(unsafe-typecast)
            remainingUSDC: uint64(cost),
            // forge-lint: disable-next-line(unsafe-typecast)
            remainingTickets: uint64(total),
            // forge-lint: disable-next-line(unsafe-typecast)
            totalTicketsOrdered: uint64(total),
            dynamicTicketCount: _dynamicTicketCount,
            referrers: new address[](0),
            referralSplit: new uint256[](0)
        });
        lastRecipient = _recipient;
        lastDynamicCount = _dynamicTicketCount;
        callCount += 1;
    }

    function getBatchOrderInfo(address _recipient)
        external
        view
        returns (BatchOrderInfo memory batchOrder, StaticTicket[] memory staticTickets)
    {
        batchOrder = orders[_recipient];
        staticTickets = new StaticTicket[](0);
    }

    /// @dev Test helper only - simulates the keeper finishing execution so
    /// a later round for the same player isn't blocked forever in tests.
    function simulateKeeperCompletion(address recipient) external {
        orders[recipient].remainingTickets = 0;
    }
}
