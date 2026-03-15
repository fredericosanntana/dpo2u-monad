  **DPO2U Compliance Protocol  ×  Monad Network**

**PRODUCT REQUIREMENTS DOCUMENT**

**DPO2U × Monad**  
Verificação de Maioridade On-Chain com ZK Proofs Nativos

Versão 3.0  ·  15 de Março de 2026  ·  Fred Santana — Founder DPO2U

# **1\. Contexto Legal**

## **1.1 ECA Digital — Lei 15.211/2025**

A Lei 15.211, em vigor em março de 2026, torna obrigatória a verificação de maioridade em plataformas digitais que operem no Brasil. As sanções são cumulativas:

| SITUAÇÃO | PENA |
| :---- | ----- |
| Autodeclaração (“tenho 18 anos”) usada como verificação | **Multa até 10% faturamento \+ suspensão** |
| Dados de menores coletados sem consentimento verificado | **LGPD Art. 52 \+ ECA Digital — stacking** |
| Dados pessoais transmitidos a terceiros sem base legal | **LGPD Art. 46 \+ multa adicional** |

## **1.2 O Paradoxo ECA × LGPD**

| ECA exige: provar que o usuário tem 18 anos. LGPD proíbe: armazenar ou transmitir a data de nascimento sem consentimento. Solução: ZK Proof. O usuário prova que satisfaz a condição sem revelar o dado que prova isso. O contrato recebe apenas: verdadeiro ou falso. |
| :---- |

# **2\. Visão do Produto**

| Qualquer dApp na Monad verifica se um endereço pertence a um adulto — em menos de 0,4s, por menos de $0,001, sem que nenhum dado pessoal toque a blockchain. A prova é gerada pelo próprio usuário, verificada matematicamente pelo contrato, sem nenhuma autoridade central no meio. |
| :---- |

## **2.1 O Que Este Projeto NÃO é**

| FORA DO ESCOPO | ONDE EXISTE |
| :---- | :---- |
| Interface gráfica para o usuário gerar a prova | Roadmap Q2 2026 |
| Integração com documentos de identidade reais | dpo2u-lgpd-kit (Camada 1, já existe) |
| Trusted Setup em produção (cerimônia MPC) | Necessário antes do Mainnet |
| Deploy em Mainnet | Após auditoria — Q3 2026 |

# **3\. Arquitetura — ZK Nativo na Monad**

## **3.1 Stack Tecnológico**

| CAMADA | TECNOLOGIA | RESPONSABILIDADE |
| :---- | :---- | :---- |
| **Circuito ZK** | Circom 2.x | Define a regra: birth\_year ≤ current\_year \- 18\. Sem revelar birth\_year. |
| **Proving System** | Groth16 (snarkjs) | Gera a prova off-chain no browser ou Node. Verificação on-chain eficiente. |
| **Verificador On-chain** | Verifier.sol (auto-gerado) | Contrato Solidity gerado pelo Circom. Verifica o pareamento da prova Groth16. |
| **Registro On-chain** | ComplianceRegistry.sol | Armazena is\_adult \= true após prova válida. Expoe isAdult() para dApps. |
| **Rede** | Monad Testnet | 10.000 TPS, EVM-compatible, Solidity 0.8.20 sem modificações. |

## **3.2 Fluxo Completo**

O fluxo inteiro acontece em duas etapas: geração da prova (off-chain, privada) e verificação \+ registro (on-chain, pública).

| ETAPA 1 — OFF-CHAIN (na máquina do usuário)   // Usuário conhece seu birth\_year (dado privado — nunca sai do dispositivo)   const input \= { birth\_year: 1990 };   // private input   const pub   \= { current\_year: 2026 }; // public input   // snarkjs gera a prova Groth16   const { proof, publicSignals } \= await snarkjs.groth16.fullProve(     { ...input, ...pub },     'age\_check.wasm',   // circuito compilado     'age\_check.zkey'    // proving key (trusted setup)   );   // proof e publicSignals não revelam birth\_year   // publicSignals \= \[2026, 1\]  // current\_year \+ is\_adult\_bit ETAPA 2 — ON-CHAIN (Monad)   // Usuário submete a prova ao ComplianceRegistry   await registry.submitProof(proof, publicSignals);   // Internamente o contrato chama o Verifier.sol:   //   verifier.verifyProof(proof.a, proof.b, proof.c, publicSignals)   //   → true: salva is\_adult\[msg.sender\] \= true   //   → false: reverte   // dApp qualquer consulta depois:   await registry.isAdult(userAddress); // → true |
| :---- |

## **3.3 Por que Groth16 e não outras opções?**

| SISTEMA | PROVA CONSTANTE? | GAS ON-CHAIN | SETUP | ESCOLHA |
| :---- | ----- | ----- | ----- | ----- |
| Groth16 (Circom) | Sim | \~250k gas | Trusted setup | **ESCOLHIDO** |
| PLONK | Sim | \~500k gas | Universal | Alternativa |
| STARKs | Não (cresce) | Alto | Sem setup | Mainnet futuro |
| Noir (Aztec) | Sim | \~400k gas | Universal | Alternativa |

Groth16 é escolhido porque gera provas de tamanho constante (192 bytes), o Verifier.sol gerado pelo Circom usa \~250k gas por verificação (\< $0,001 na Monad) e a documentação \+ ferramental para EVM é o mais maduro disponível.

# **4\. Circuito ZK — age\_check.circom**

## **4.1 Lógica do Circuito**

O circuito implementa uma única constraint: o ano atual menos o ano de nascimento deve ser maior ou igual a 18\. O ano de nascimento é um input privado — o verificador nunca o vê.

| Princípio ZK aplicado: o usuário prova que conhece um valor X tal que 2026 \- X ≥ 18, sem revelar X. O contrato verifica a prova matematicamente sem precisar ver X. |
| :---- |

## **4.2 age\_check.circom**

| pragma circom 2.0.0; include "circomlib/circuits/comparators.circom"; // Prova que birth\_year é suficientemente antigo sem revelar birth\_year template AgeCheck() {     // Inputs     signal input  birth\_year;   // PRIVADO — nunca exposto     signal input  current\_year; // PÚBLICO — 2026     signal output is\_adult;     // PÚBLICO — 1 (true) ou 0 (false)     // Sanity checks — evita inputs maliciosos     // birth\_year deve estar num range plausível     signal age;     age \<== current\_year \- birth\_year;     // Verifica: age \>= 18     // LessEqThan(n): verifica que in\[0\] \<= in\[1\] usando n bits     component ageCheck \= LessEqThan(7); // 7 bits → max 127     ageCheck.in\[0\] \<== 18;  // mínimo     ageCheck.in\[1\] \<== age; // idade calculada     // Constraint: birth\_year deve ser \<= current\_year     // (evita idades negativas / overflow)     component notFuture \= LessEqThan(12); // 12 bits → max 4095     notFuture.in\[0\] \<== birth\_year;     notFuture.in\[1\] \<== current\_year;     // Output: 1 se adulto, 0 caso contrário     is\_adult \<== ageCheck.out \* notFuture.out; } component main { public \[current\_year\] } \= AgeCheck(); |
| :---- |

## **4.3 Comandos de Build**

| \# 1\. Compilar o circuito circom age\_check.circom \--r1cs \--wasm \--sym \-o ./build \# 2\. Trusted Setup (Powers of Tau — fase 1, pública) snarkjs powersoftau new bn128 12 pot12\_0000.ptau \-v snarkjs powersoftau contribute pot12\_0000.ptau pot12\_0001.ptau \--name='DPO2U' snarkjs powersoftau prepare phase2 pot12\_0001.ptau pot12\_final.ptau \-v \# 3\. Trusted Setup (fase 2 — específica do circuito) snarkjs groth16 setup build/age\_check.r1cs pot12\_final.ptau age\_check\_0000.zkey snarkjs zkey contribute age\_check\_0000.zkey age\_check\_final.zkey \--name='DPO2U' snarkjs zkey export verificationkey age\_check\_final.zkey verification\_key.json \# 4\. Gerar Verifier.sol automaticamente snarkjs zkey export solidityverifier age\_check\_final.zkey contracts/Verifier.sol \# Resultado: contracts/Verifier.sol pronto para deploy na Monad |
| :---- |

| O Verifier.sol é gerado automaticamente pelo snarkjs. Ele contém a lógica de pareamento de curvas elípticas (BN128) e pode ser deployado em qualquer EVM sem modificação. Na Monad, a verificação custa \~250k gas — menos de $0,001. |
| :---- |

# **5\. Contratos Solidity — Especificação**

## **5.1 Verifier.sol**

Gerado automaticamente pelo snarkjs. Não editar manualmente. Expoe uma única função pública:

| // Auto-gerado por: snarkjs zkey export solidityverifier // Não modificar manualmente. contract Verifier {     function verifyProof(         uint\[2\]    memory a,         uint\[2\]\[2\] memory b,         uint\[2\]    memory c,         uint\[2\]    memory input  // \[current\_year, is\_adult\]     ) public view returns (bool) { ... } } |
| :---- |

## **5.2 ComplianceRegistry.sol**

Recebe a prova do usuário, delega a verificação matemática ao Verifier.sol e, se válida, registra o endereço como adulto.

| // SPDX-License-Identifier: MIT // DPO2U Compliance Protocol — Monad Network // ECA Digital (Lei 15.211) \+ LGPD (Lei 13.709) compliant pragma solidity ^0.8.20; import "./Verifier.sol"; contract ComplianceRegistry {     // ── Storage ────────────────────────────────────────     struct AgeRecord {         bool    is\_adult;    // resultado da ZK proof — TRUE ou FALSE         uint256 timestamp;   // quando foi verificado         uint256 proof\_year;  // current\_year que foi usado na prova (auditoria)     }     mapping(address \=\> AgeRecord) private registry;     Verifier  public verifier;  // Verifier.sol deployado     address   public owner;     // ── Events ─────────────────────────────────────────     event AdultVerified  (address indexed subject, uint256 proof\_year);     event ComplianceQueried(address indexed subject, bool result);     event AdultRevoked   (address indexed subject, string reason);     modifier onlyOwner() { require(msg.sender==owner,"DPO2U: only owner"); \_; }     constructor(address \_verifier) {         owner    \= msg.sender;         verifier \= Verifier(\_verifier);     }     // ── WRITE: o próprio usuário submete sua prova ────     function submitProof(         uint\[2\]    calldata a,         uint\[2\]\[2\] calldata b,         uint\[2\]    calldata c,         uint\[2\]    calldata publicSignals // \[current\_year, is\_adult\_bit\]     ) external {         // 1\. Verificar a prova matematicamente         require(             verifier.verifyProof(a, b, c, publicSignals),             "DPO2U: invalid ZK proof"         );         // 2\. Verificar que is\_adult\_bit \== 1         require(publicSignals\[1\] \== 1, "DPO2U: proof does not satisfy age");         // 3\. Verificar que current\_year é razoável (anti-replay)         // current\_year é público — o contrato pode validar         uint256 currentYear \= publicSignals\[0\];         require(currentYear \>= 2024 && currentYear \<= 2030,                 "DPO2U: invalid year");         // 4\. Registrar         registry\[msg.sender\] \= AgeRecord({             is\_adult:   true,             timestamp:  block.timestamp,             proof\_year: currentYear         });         emit AdultVerified(msg.sender, currentYear);     }     // ── READ: qualquer dApp consulta ────────────────────     function isAdult(address subject) external returns (bool) {         bool result \= registry\[subject\].is\_adult;         emit ComplianceQueried(subject, result);         return result;     }     function getRecord(address subject)         external view returns (AgeRecord memory) {         return registry\[subject\];     }     // ── ADMIN: LGPD Art. 18 — direito de retificação ────     function revokeAdult(address subject, string calldata reason)         external onlyOwner {         registry\[subject\].is\_adult \= false;         emit AdultRevoked(subject, reason);     }     function setVerifier(address \_v) external onlyOwner {         verifier \= Verifier(\_v);     } } |
| :---- |

## **5.3 Decisões de Design**

| DECISÃO | JUSTIFICATIVA |
| :---- | :---- |
| **submitProof() chamado pelo próprio usuário** | Elimina a necessidade de um relayer. O usuário paga o próprio gas. Sem autoridade central no fluxo. |
| **is\_adult armazenado como bool** | Apenas o resultado importa. Nenhum dado pessoal (birth\_year, nome, CPF) toca a blockchain. |
| **proof\_year armazenado (não birth\_year)** | Auditabilidade sem violação de privacidade. Saber em que ano a prova foi gerada é métadado neutro. |
| **revokeAdult() obrigatório** | LGPD Art. 18: direito de retificação e exclusão. Sem essa função o protocolo não cumpre a LGPD. |
| **Validação de current\_year no contrato** | Anti-replay: impede que uma prova gerada em 2026 seja usada em 2040 por alguém que era menor em 2026\. |

# **6\. Geração da Prova — Client-side (Node.js / Browser)**

## **6.1 prove.ts — Script de Geração**

| import \* as snarkjs from 'snarkjs'; import { ethers }   from 'ethers'; export async function generateAgeProof(birth\_year: number) {   const current\_year \= new Date().getFullYear(); // 2026   // birth\_year nunca sai desta função — é apenas um input local   const { proof, publicSignals } \= await snarkjs.groth16.fullProve(     { birth\_year, current\_year },     'build/age\_check\_js/age\_check.wasm',     'build/age\_check\_final.zkey'   );   // Formatar para calldata Solidity   const calldata \= await snarkjs.groth16.exportSolidityCallData(     proof, publicSignals   );   // calldata \= '\["0x...","0x..."\],\[...\],\[...\],\[current\_year, is\_adult\]'   return { proof, publicSignals, calldata }; } export async function submitToMonad(birth\_year: number, signer: ethers.Signer) {   const { calldata } \= await generateAgeProof(birth\_year);   // Parse calldata para os parâmetros do contrato   const args \= JSON.parse('\[' \+ calldata \+ '\]');   const \[a, b, c, input\] \= args;   // Submeter ao ComplianceRegistry na Monad   const registry \= new ethers.Contract(REGISTRY\_ADDR, REGISTRY\_ABI, signer);   const tx \= await registry.submitProof(a, b, c, input);   await tx.wait();   console.log('Prova submetida. Endereço registrado como adulto.'); } |
| :---- |

# **7\. Definition of Done**

## **7.1 Circuito Circom**

1. age\_check.circom compila sem erros: circom age\_check.circom \--r1cs \--wasm \--sym

2. Trusted setup concluído: pot12\_final.ptau \+ age\_check\_final.zkey gerados

3. Verifier.sol exportado via snarkjs zkey export solidityverifier

4. Prova válida gerada para birth\_year=1990, current\_year=2026 → is\_adult=1

5. Prova inválida para birth\_year=2010, current\_year=2026 → is\_adult=0

## **7.2 ComplianceRegistry.sol**

6. Deploy de Verifier.sol \+ ComplianceRegistry.sol na Monad Testnet

7. submitProof() aceita prova válida e registra is\_adult=true

8. submitProof() reverte com prova inválida

9. submitProof() reverte se is\_adult\_bit \!= 1 (prova de menor)

10. isAdult() retorna true após submitProof() bem-sucedido

11. isAdult() emite evento ComplianceQueried

12. revokeAdult() seta is\_adult=false e emite AdultRevoked

13. Mínimo 12 testes unitários passando (Hardhat \+ snarkjs)

## **7.3 Demo (MonadBlitz)**

14. stress-test.ts gera 10 provas locais e submete todas ao contrato

15. Output mostra: prova gerada \+ tx confirmada \+ isAdult()=true para cada endereço

16. Demonstra visualmente que birth\_year nunca aparece no output

# **8\. Estrutura de Arquivos do Projeto**

| dpo2u-monad/ ├── circuits/ │   └── age\_check.circom          \# circuito ZK (Sec. 4.2) ├── build/                         \# gerado pelo circom (não commitar .zkey) │   ├── age\_check\_js/ │   │   └── age\_check.wasm │   ├── age\_check.r1cs │   └── age\_check\_final.zkey ├── contracts/ │   ├── Verifier.sol              \# AUTO-GERADO pelo snarkjs │   └── ComplianceRegistry.sol    \# mão (Sec. 5.2) ├── scripts/ │   ├── prove.ts                  \# gera prova \+ submete (Sec. 6.1) │   ├── deploy.ts                 \# deploy Verifier \+ Registry │   └── stress-test.ts            \# demo MonadBlitz ├── test/ │   └── compliance.test.ts        \# 12+ testes unitários ├── hardhat.config.ts └── .env                           \# MONAD\_RPC\_URL, PRIVATE\_KEY |
| :---- |

# **9\. Plano de Execução**

| FASE | TAREFAS | TEMPO |
| :---- | :---- | ----- |
| **1 — Circuito** | Instalar circom \+ snarkjs · Escrever age\_check.circom · Compilar · Trusted setup · Gerar Verifier.sol | \~2h |
| **2 — Contratos** | Escrever ComplianceRegistry.sol · Configurar Hardhat para Monad · 12 testes · Deploy Testnet | \~3h |
| **3 — Client** | Escrever prove.ts · Testar geração de prova local · Testar submitProof() end-to-end | \~2h |
| **4 — Demo** | Escrever stress-test.ts · Ajustar output do terminal · Ensaio completo do pitch | \~1h |

DPO2U Compliance Protocol  ·  docs.dpo2u.com  ·  Fred Santana

PRD v3.0  ·  15 de Março de 2026  ·  Confidencial