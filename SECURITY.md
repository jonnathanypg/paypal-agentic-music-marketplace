# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |

## Security Architecture
- **Zero Plaintext Credentials**: PayPal Client Secrets and JWT signing keys are loaded strictly from environment variables (`.env`) and never committed to source control.
- **Idempotent Ledger Verification**: Every PayPal Order ID (`paypal_order_id`) is verified against `/v2/checkout/orders/{id}` and checked for uniqueness in `ArtistSaleLedger` before crediting artist balances.
- **HTTP-Only JWT Sessions**: Authentication tokens are stored in `HttpOnly`, `SameSite=Lax` cookies.

## Reporting a Vulnerability
Please report any suspected security vulnerabilities via GitHub Security Advisories rather than public issues.
