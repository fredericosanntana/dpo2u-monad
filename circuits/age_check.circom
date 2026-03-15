pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";

template AgeCheck() {
    // Private input
    signal input birth_year;

    // Public inputs
    signal input current_year;

    // Output
    signal output is_adult;

    // birth_year must be <= current_year - 18
    // i.e., current_year - birth_year >= 18
    // Using LessEqThan(16) — 16-bit comparator (supports values up to 65535)
    component leq = LessEqThan(16);
    leq.in[0] <== birth_year;
    leq.in[1] <== current_year - 18;

    is_adult <== leq.out;
}

component main { public [current_year] } = AgeCheck();
