declare module "snarkjs" {
  export namespace groth16 {
    function fullProve(
      input: Record<string, bigint | number | string>,
      wasmFile: string,
      zkeyFile: string
    ): Promise<{ proof: any; publicSignals: string[] }>;

    function verify(
      vkey: any,
      publicSignals: string[],
      proof: any
    ): Promise<boolean>;

    function exportSolidityCallData(
      proof: any,
      publicSignals: string[]
    ): Promise<string>;
  }
}
