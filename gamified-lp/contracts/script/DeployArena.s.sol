// SPDX-License-Identifier: MIT
pragma solidity >=0.8.27;

import "forge-std/Script.sol";
import "../src/PixieArena.sol";

contract DeployArena is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PK");
        address usdc = vm.envAddress("USDC_ADDRESS");

        vm.startBroadcast(deployerPk);

        PixieArena arena = new PixieArena(usdc);
        console.log("PixieArena deployed at:", address(arena));

        vm.stopBroadcast();
    }
}
