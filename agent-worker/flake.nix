{
  description = "AgentSwarm worker runtime packages";

  nixConfig = {
    extra-experimental-features = [
      "nix-command"
      "flakes"
    ];
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      lib = nixpkgs.lib;
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forEachSystem = f:
        lib.genAttrs systems (system:
          f {
            pkgs = import nixpkgs { inherit system; };
          });
    in
    {
      packages = forEachSystem ({ pkgs }: {
        default = pkgs.buildEnv {
          name = "agentswarm-worker-env";
          paths = with pkgs; [
            bashInteractive
            bun
            cacert
            code-server
            coreutils
            curl
            docker
            dropbear
            findutils
            gawk
            gh
            git
            gnugrep
            gnused
            iptables
            nodejs_22
            ncurses
            openssh
            procps
            python3
            ripgrep
            shadow
            tmux
            util-linux
            which
            zsh
          ];
        };
        nodejs = pkgs.nodejs_22;
      });
    };
}
