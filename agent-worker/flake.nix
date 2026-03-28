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
            dbus
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
            openbox
            patchelf
            procps
            python3
            python3Packages.websockify
            ripgrep
            scrot
            shadow
            stdenv.cc
            stdenv.cc.cc.lib
            tmux
            util-linux
            novnc
            wmctrl
            which
            x11vnc
            xdotool
            xorg.xauth
            xorg.xhost
            xorg.xorgserver
            xorg.xrandr
            xorg.xset
            xorg.xsetroot
            xterm
            zsh
          ];
        };
        nodejs = pkgs.nodejs_22;
      });
    };
}
