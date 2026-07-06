/**
 * Swap-later interface: v1 is Supabase magic-link (email OTP). Later:
 * GitHub OAuth + payout KYC populate the same Contributor shape.
 */
export interface Contributor {
  id: string;
  email: string;
}

export interface Identity {
  login(email: string): Promise<void>;
  verify(email: string, code: string): Promise<Contributor>;
  currentContributor(): Promise<Contributor | null>;
  accessToken(): Promise<string | null>;
}
