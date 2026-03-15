# DPO2U x Monad — Verificacao de Maioridade com ZK Proofs Nativos

MonadBLitz Rio de Janeiro

**Submissao MonadBlitz Hackathon**

[![Demo Video](https://img.youtube.com/vi/Oi5PKiFv8q4/maxresdefault.jpg)](https://youtu.be/Oi5PKiFv8q4)

> Qualquer dApp na Monad verifica se um endereco pertence a um adulto — em menos de 0,4s, por menos de $0,001, sem que nenhum dado pessoal toque a blockchain. A prova e gerada pelo proprio usuario, verificada matematicamente pelo contrato, sem nenhuma autoridade central no meio.

## O Problema

A **Lei 15.211/2025 (ECA Digital)**, em vigor em marco de 2026, obriga todas as plataformas digitais no Brasil a verificar a maioridade do usuario antes de conceder acesso a conteudo restrito. Ao mesmo tempo, a **LGPD (Lei 13.709)** proibe armazenar ou transmitir dados pessoais (como data de nascimento) sem consentimento. As duas leis criam um paradoxo:

| Lei | Exigencia |
|-----|-----------|
| **ECA Digital** | Provar que o usuario tem 18+ anos |
| **LGPD Art. 14** | Nao coletar dados pessoais de menores |
| **LGPD Art. 46** | Nao transmitir dados pessoais a terceiros |

Autodeclaracao ("tenho 18 anos") e **expressamente proibida** — pena: multa de ate 10% do faturamento bruto + suspensao do servico.

**A unica solucao:** Zero-Knowledge Proofs. O usuario prova que satisfaz a condicao sem revelar o dado que prova isso.

## A Solucao

O DPO2U x Monad e uma camada de verificacao de maioridade ZK-nativa. O usuario gera uma prova Groth16 off-chain provando que `birth_year <= current_year - 18`, submete on-chain, e o contrato verifica matematicamente. Sem relayer, sem intermediario, sem dados pessoais.

O contrato armazena **apenas um booleano por endereco**. Nao ha score, data de nascimento ou CPF. A Monad nao sabe quantos anos o usuario tem — ela sabe apenas que uma prova criptografica valida atestou que aquele endereco pertence a um adulto.

## Arquitetura

```
Dispositivo do Usuario (privado)       Rede Monad (publico)
================================      ========================

birth_year = 1990  ----+
                       |
current_year = 2026 ---+--> snarkjs.groth16    submitProof(a,b,c,input)
                       |    .fullProve()  --->  ComplianceRegistry.sol
                       |                            |
                       |    prova (192 bytes)        +--> Verifier.sol
                       |    publicSignals:           |    verifyProof() = true
                       |      [is_adult=1,           |
                       |       year=2026]            +--> registry[msg.sender]
                       |                                  = { is_adult: true }
birth_year NUNCA
sai do dispositivo                    Qualquer dApp:
                                      registry.isAdult(addr) --> true/false
```

### Stack Tecnologico

| Camada | Tecnologia | Responsabilidade |
|--------|-----------|------------------|
| **Circuito ZK** | Circom 2.x | Define a regra: `birth_year <= current_year - 18` sem revelar `birth_year` |
| **Proving System** | Groth16 (snarkjs) | Gera a prova off-chain (browser ou Node). Prova de tamanho constante (192 bytes) |
| **Verificador On-chain** | `Verifier.sol` (auto-gerado) | Contrato Solidity gerado pelo snarkjs. Verifica pareamento de curvas elipticas BN128 |
| **Registro On-chain** | `ComplianceRegistry.sol` | Armazena `is_adult = true` apos prova valida. Expoe `isAdult()` para dApps |
| **Rede** | Monad Testnet | 10.000 TPS, EVM-compatible, ~250k gas por verificacao (< $0,001) |

## Como Funciona

### Etapa 1 — Usuario gera a prova (off-chain, privado)

```typescript
// birth_year e um input PRIVADO — nunca sai do dispositivo do usuario
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  { birth_year: 1990, current_year: 2026 },
  'age_check.wasm',    // circuito compilado
  'age_check.zkey'     // proving key
);
// publicSignals = [1, 2026]  -->  [is_adult, current_year]
// birth_year NAO esta nos publicSignals
```

### Etapa 2 — Usuario submete a prova on-chain (Monad)

```typescript
await registry.submitProof(a, b, c, input);
// O contrato internamente chama o Verifier.sol:
//   verifier.verifyProof(a, b, c, input) --> true
//   Armazena: registry[msg.sender].is_adult = true
```

### Etapa 3 — Qualquer dApp consulta compliance

```typescript
const isAdult = await registry.isAdult(userAddress); // --> true
// Emite evento ComplianceQueried para trilha de auditoria regulatoria
```

## Integre no seu dApp

### 1. On-chain (Solidity)

```solidity
// Interface minima — copie para o seu contrato
interface IComplianceRegistry {
    function isAdult(address subject) external returns (bool);
}

contract SeuDApp {
    IComplianceRegistry constant REGISTRY =
        IComplianceRegistry(0x0F953948Cb58ddA0996D8633a642F5bA47fd214a); // Monad Testnet

    modifier onlyAdult() {
        require(REGISTRY.isAdult(msg.sender), "DPO2U: usuario nao verificado");
        _;
    }

    function acessoRestrito() external onlyAdult {
        // sua logica aqui — so adultos verificados entram
    }
}
```

### 2. Off-chain (TypeScript / ethers.js)

```typescript
import { ethers } from "ethers";

const REGISTRY = new ethers.Contract(
  "0x0F953948Cb58ddA0996D8633a642F5bA47fd214a",
  ["function isAdult(address) returns (bool)"],
  provider
);

const adulto = await REGISTRY.isAdult.staticCall(userAddress); // leitura sem gas
```

### 3. Usuario gera e submete prova

```typescript
import { generateAgeProof } from "./scripts/prove";

// 1. Gerar prova off-chain (birth_year NUNCA sai do dispositivo)
const { a, b, c, input } = await generateAgeProof(1990);

// 2. Submeter on-chain
await registry.submitProof(a, b, c, input);
```

## O Circuito — `age_check.circom`

```circom
pragma circom 2.0.0;
include "circomlib/circuits/comparators.circom";

template AgeCheck() {
    signal input  birth_year;    // PRIVADO — nunca exposto
    signal input  current_year;  // PUBLICO — 2026
    signal output is_adult;      // PUBLICO — 1 (true) ou 0 (false)

    // birth_year deve ser <= current_year - 18
    component leq = LessEqThan(16);
    leq.in[0] <== birth_year;
    leq.in[1] <== current_year - 18;

    is_adult <== leq.out;
}

component main { public [current_year] } = AgeCheck();
```

O usuario prova que conhece um valor `birth_year` tal que `birth_year <= 2026 - 18`, sem revelar `birth_year`. O verificador confirma a matematica sem ver o input privado.

## O Contrato — `ComplianceRegistry.sol`

```solidity
function submitProof(
    uint[2] calldata a, uint[2][2] calldata b,
    uint[2] calldata c, uint[2] calldata input
) external {
    require(year >= 2024 && year <= 2030, "DPO2U: year out of range");  // anti-replay
    require(is_adult_bit == 1,             "DPO2U: not adult");
    require(verifier.verifyProof(a,b,c,input), "DPO2U: invalid proof"); // verificacao matematica

    registry[msg.sender] = AgeRecord({ is_adult: true, timestamp: block.timestamp, proof_year: year });
    emit AdultVerified(msg.sender, year);
}
```

| Funcao | Acesso | Descricao |
|--------|--------|-----------|
| `submitProof(a, b, c, input)` | Qualquer um | Submete prova ZK de maioridade — verificada matematicamente |
| `isAdult(address)` | Publico | Verifica se endereco e adulto verificado. Emite `ComplianceQueried` para auditoria |
| `getRecord(address)` | Publico | Registro completo de auditoria: `is_adult`, `timestamp`, `proof_year` |
| `revokeAdult(address, reason)` | Owner | LGPD Art. 18 — direito de retificacao/exclusao |
| `setVerifier(address)` | Owner | Atualizar contrato verificador |

### Decisoes de Design

| Decisao | Justificativa |
|---------|---------------|
| **Usuario submete propria prova** | Sem relayer. Sem autoridade central. Usuario paga proprio gas. |
| **Apenas um bool armazenado** | Nenhum dado pessoal on-chain. Apenas o resultado importa. |
| **`proof_year` armazenado (nao `birth_year`)** | Auditabilidade sem violacao de privacidade. Metadado neutro. |
| **`revokeAdult()` obrigatorio** | LGPD Art. 18: direito de retificacao. Sem ela, o protocolo nao cumpre a LGPD. |
| **Validacao de ano [2024-2030]** | Anti-replay: impede que uma prova de 2026 seja reutilizada em 2040. |
| **Groth16 ao inves de PLONK/STARKs** | Provas constantes de 192 bytes, ~250k gas, ferramental EVM mais maduro. |

## Consumer App — AgeGatedGame (Case Roblox x Lei FELCA)

A **Lei FELCA** (ECA Digital) provocou a **#RevoltaDoRoblox** — milhoes de menores protestando contra a verificacao de idade obrigatoria em plataformas de jogos. O `AgeGatedGame` e um consumer app que demonstra como um jogo na Monad integraria o DPO2U para cumprir a lei:

- **Adulto verificado (ZK):** joga normalmente — `joinGame()`, `enableChat()`, `purchaseItem()`
- **Menor (nao verificado):** so pode `protestar()` — gravado on-chain, imutavel e eterno
- **Adulto tenta protestar:** *"FELCA: voce ja pode jogar, para de reclamar"* 😂

```
Adulto (ZK verified)              Menor (sem prova)
====================              ==================
joinGame()      ✅ OK              joinGame()      ❌ BLOQUEADO
enableChat()    ✅ OK              enableChat()    ❌ BLOQUEADO
purchaseItem()  ✅ OK              purchaseItem()  ❌ BLOQUEADO
protestar()     ❌ BLOQUEADO       protestar()     ✅ OK (on-chain!)
```

### Contrato `AgeGatedGame.sol`

```solidity
contract AgeGatedGame {
    IComplianceRegistry public registry;

    modifier onlyAdult() {
        require(registry.isAdult(msg.sender), "FELCA: verifique sua idade primeiro");
        _;
    }

    modifier onlyMinor() {
        require(!registry.isAdult(msg.sender), "FELCA: voce ja pode jogar, para de reclamar");
        _;
    }

    function joinGame()                    external onlyAdult { ... }
    function enableChat()                  external onlyAdult { ... }
    function purchaseItem(uint256 itemId)  external onlyAdult { ... }
    function protestar(string msg)         external onlyMinor { ... } // salva on-chain!
    function getProtestos()                external view returns (Protesto[] memory) { ... }
}
```

### Demo — 15 transacoes reais na Monad Testnet

```
npm run demo-game
```

```
  4. ADULTO — Jogando normalmente
  │ joinGame()       OK ✅
  │ enableChat()     OK ✅
  │ purchaseItem(42) OK ✅ Skin Legendaria
  │ purchaseItem(7)  OK ✅ Espada de Diamante
  │ purchaseItem(99) OK ✅ Pet Dragao

  5. MENOR — Tentando jogar...
  │ joinGame()       BLOQUEADO ❌
  │ Revert           FELCA: verifique sua idade

  6. MENOR — Protestando on-chain (TX reais!)
  │ 📢 protestar()   "QUERO JOGAR ROBLOX!!!" ✅
  │ 📢 protestar()   "LEI FELCA INJUSTA!!! DEVOLVE MEU JOGO" ✅
  │ 📢 protestar()   "#RevoltaDoRoblox #ForaFELCA" ✅

  7. ADULTO — Tentando protestar por solidariedade...
  │ protestar()      BLOQUEADO ❌
  │ Motivo           voce ja pode jogar, para de reclamar 😂
```

### Testes — 10 testes unitarios

```
npm run test -- test/game.test.ts
```

```
AgeGatedGame (Case Roblox x Lei FELCA)
  Deploy
    ✔ 1. deploys with correct registry address
  Adulto verificado — joga normalmente
    ✔ 2. joinGame() OK, emite PlayerJoined
    ✔ 3. enableChat() OK apos joinGame
    ✔ 4. purchaseItem(42) OK, emite ItemPurchased
    ✔ 5. enableChat() sem joinGame reverte
    ✔ 6. joinGame() duplicado reverte
  Menor — so pode protestar
    ✔ 7. joinGame() reverte com mensagem FELCA
    ✔ 8. protestar() OK, salva on-chain
    ✔ 9. multiplos protestos de diferentes menores
  Adulto nao pode protestar
    ✔ 10. protestar() reverte — 'para de reclamar'

10 passing (6s)
```

## Resultados dos Testes

25 testes unitarios cobrindo o fluxo ZK completo + consumer app (Hardhat + provas Groth16 reais):

```
ComplianceRegistry (ZK v3)
  Deployment
    ✔ 1. deploys Verifier + Registry correctly
  submitProof
    ✔ 2. accepts valid proof (birth_year=1990) → is_adult=true
    ✔ 3. emits AdultVerified with correct proof_year
    ✔ 4. getRecord returns full struct after valid proof
    ✔ 5. reverts with invalid proof (fabricated data)
    ✔ 6. reverts if is_adult_bit != 1 (minor, birth_year=2015)
    ✔ 7. reverts if year out of range [2024, 2030]
  isAdult
    ✔ 8. returns true after valid submitProof
    ✔ 9. returns false for unregistered address
    ✔ 10. emits ComplianceQueried
  getRecord
    ✔ 11. returns zeros for unregistered address
  revokeAdult
    ✔ 12. sets is_adult=false and emits AdultRevoked
    ✔ 13. reverts for non-owner
  setVerifier
    ✔ 14. updates verifier (only owner)
  Integration
    ✔ 15. isAdult returns false after revocation (full lifecycle)

15 passing (4s)
```

## Resultados do Stress Test

Verificacao continua de 5 minutos por 10 consumer dApps simulados:

- **10 usuarios** registrados via provas ZK reais (552ms media por prova)
- **300+ rounds** de verificacoes de compliance em todas as dApps
- **~1.000 checks/segundo** de throughput
- **0 bytes** de dados pessoais on-chain
- **$0,00** de gas cost para queries (view calls)

## Enderecos de Deploy (Monad Testnet — chainId 10143)

| Contrato | Endereco |
|----------|----------|
| **Groth16Verifier** | `0x05DB1C300aF638F2a028Cd949d9AC638d8294360` |
| **ComplianceRegistry** | `0x0F953948Cb58ddA0996D8633a642F5bA47fd214a` |
| **AgeGatedGame** | `0x4c816264EabEcA2Dd5C27C27C88c2eCc4eC0f1e9` |
| **Owner** | `0x2645AaC1e42EF3652156932B1181eA72006e22cF` |

## Estrutura do Projeto

```
dpo2u-monad/
├── circuits/
│   └── age_check.circom              # Circuito ZK (Circom 2.x)
├── build/                             # Artefatos gerados (nao commitar)
│   ├── age_check_js/age_check.wasm    # Circuito compilado (WASM)
│   ├── age_check.r1cs                 # Sistema de constraints rank-1
│   └── age_check_final.zkey           # Proving key (trusted setup)
├── contracts/
│   ├── Verifier.sol                   # Verificador Groth16 auto-gerado
│   ├── ComplianceRegistry.sol         # Contrato principal (verificacao ZK + registro)
│   └── AgeGatedGame.sol               # Consumer app (Case Roblox x Lei FELCA)
├── scripts/
│   ├── build-circuit.sh               # Pipeline completa de build do circuito
│   ├── prove.ts                       # Geracao de prova client-side (snarkjs)
│   ├── deploy.ts                      # Deploy Verifier + Registry
│   ├── deploy-game.ts                 # Deploy AgeGatedGame
│   ├── demo.ts                        # Demo funcional do protocolo
│   ├── demo-game.ts                   # Demo AgeGatedGame (15 TX reais)
│   ├── showcase.ts                    # Showcase teatral com dashboard live
│   ├── volume.ts                      # Load test continuo
│   └── stress-test.ts                 # Benchmark 5min de verificacao por dApps
├── test/
│   ├── compliance.test.ts             # 15 testes unitarios ZK-based
│   └── game.test.ts                   # 10 testes consumer app
├── hardhat.config.ts                  # Monad Testnet (chainId 10143)
└── package.json
```

## Quick Start

```bash
# Instalar dependencias
npm install

# Compilar circuito ZK (requer circom 2.x instalado)
npm run build:circuit

# Compilar contratos Solidity
npx hardhat compile

# Rodar testes (15 testes ZK-based)
npx hardhat test

# Deploy na Monad Testnet
npx hardhat run scripts/deploy.ts --network monad-testnet

# Deploy do consumer app (AgeGatedGame)
npm run deploy-game

# Demo do protocolo
npm run demo

# Demo do AgeGatedGame (Case Roblox x Lei FELCA)
npm run demo-game

# Showcase teatral com dashboard live
npm run showcase

# Rodar stress test demo
npx hardhat run scripts/stress-test.ts
```

## Compliance Legal

| Exigencia | Como o DPO2U atende |
|-----------|---------------------|
| **ECA Digital — verificacao de idade** | `isAdult()` retorna resultado criptograficamente verificado |
| **LGPD Art. 14 — protecao de dados de menores** | Nenhum dado pessoal armazenado on-chain. Apenas um booleano. |
| **LGPD Art. 18 — direito de retificacao** | `revokeAdult()` seta `is_adult = false` |
| **LGPD Art. 46 — minimizacao de dados** | `birth_year` nunca sai do dispositivo do usuario. Zero knowledge. |
| **Trilha de auditoria** | Evento `ComplianceQueried` registrado a cada consulta |

---

**DPO2U Compliance Protocol** — Fred Santana, Founder

Zero dados pessoais on-chain. Zero knowledge. Full compliance.
