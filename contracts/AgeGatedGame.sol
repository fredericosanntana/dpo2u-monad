// SPDX-License-Identifier: MIT
// Case: Roblox x Lei FELCA (ECA Digital, Lei 15.211/2025)
// Consumer App — DPO2U Compliance Protocol
// "Adulto joga, menor protesta." 😤
pragma solidity ^0.8.20;

interface IComplianceRegistry {
    function isAdult(address subject) external returns (bool);
}

contract AgeGatedGame {
    struct Protesto {
        address autor;
        string  mensagem;
        uint256 timestamp;
    }

    IComplianceRegistry public registry;
    mapping(address => bool) public players;
    uint256 public totalPlayers;

    Protesto[] public protestos;
    uint256 public totalProtestos;

    event PlayerJoined(address indexed player);
    event ChatEnabled(address indexed player);
    event ItemPurchased(address indexed player, uint256 itemId);
    event ProtestoRegistrado(address indexed autor, string mensagem);

    modifier onlyAdult() {
        require(registry.isAdult(msg.sender), "FELCA: verifique sua idade primeiro");
        _;
    }

    modifier onlyMinor() {
        require(!registry.isAdult(msg.sender), "FELCA: voce ja pode jogar, para de reclamar");
        _;
    }

    constructor(address _registry) {
        registry = IComplianceRegistry(_registry);
    }

    // ─── Funcoes para ADULTOS ───────────────────────────────────────────────

    function joinGame() external onlyAdult {
        require(!players[msg.sender], "FELCA: voce ja esta no jogo");
        players[msg.sender] = true;
        totalPlayers++;
        emit PlayerJoined(msg.sender);
    }

    function enableChat() external onlyAdult {
        require(players[msg.sender], "FELCA: entre no jogo antes de ativar o chat");
        emit ChatEnabled(msg.sender);
    }

    function purchaseItem(uint256 itemId) external onlyAdult {
        require(players[msg.sender], "FELCA: entre no jogo antes de comprar");
        emit ItemPurchased(msg.sender, itemId);
    }

    // ─── Funcoes para MENORES ───────────────────────────────────────────────

    function protestar(string calldata mensagem) external onlyMinor {
        protestos.push(Protesto({
            autor:     msg.sender,
            mensagem:  mensagem,
            timestamp: block.timestamp
        }));
        totalProtestos++;
        emit ProtestoRegistrado(msg.sender, mensagem);
    }

    // ─── Leitura (qualquer um) ──────────────────────────────────────────────

    function getProtestos() external view returns (Protesto[] memory) {
        return protestos;
    }
}
