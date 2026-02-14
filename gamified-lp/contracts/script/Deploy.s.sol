// SPDX-License-Identifier: MIT
pragma solidity >=0.8.27;

import "forge-std/Script.sol";
import "../src/GamifiedLP.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PK");
        address usdc = vm.envAddress("USDC_ADDRESS");

        vm.startBroadcast(deployerPk);

        GamifiedLP lp = new GamifiedLP(usdc);
        console.log("GamifiedLP deployed at:", address(lp));

        vm.stopBroadcast();
    }
}
