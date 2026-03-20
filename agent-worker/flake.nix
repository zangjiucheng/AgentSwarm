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
            binutils
            bun
            cacert
            code-server
            coreutils
            curl
            docker
            dropbear
            findutils
            glibc
            glibc.bin
            gawk
            gh
            git
            gnugrep
            gnused
            iptables
            nix-ld
            nodejs_22
            ncurses
            openssh
            patchelf
            procps
            python3
            ripgrep
            shadow
            stdenv.cc.cc
            stdenv.cc.cc.lib
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
