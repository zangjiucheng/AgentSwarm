{
  description = "Example extra flake for AgentSwarm computer-use workers";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forEachSystem = f:
        builtins.listToAttrs (map (system: {
          name = system;
          value = f system;
        }) systems);
    in
    {
      packages = forEachSystem (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          computerUseEnv = pkgs.buildEnv {
            name = "agentswarm-example-computer-use-extra";
            paths = with pkgs; [
              firefox
              imagemagick
              tesseract
              xclip
            ];
          };
        });
    };
}
