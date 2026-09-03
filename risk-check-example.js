// risk-check-example.js
//
// Optional pre-buy insider-cluster check via RiskDataApi (tnt-audit.com).
// Standalone example — not wired into src/processors/ directly, since I
// didn't want to touch pumpfunProcessor.js / raydiumCpmmProcessor.js
// without knowing exactly where you'd want the gate in your buy flow.
//
// Uses the built-in fetch() (Node >= 18, matches this repo's engines
// requirement) — no new dependency needed.
//
// Traces top holders back to their first funder — catches supply
// deliberately split across several wallets funded by the same source,
// which raw holder-percentage checks can miss.
//
// 5 free calls/day, no signup. Set RISK_API_KEY in .env for 15/day
// (free, email only, no card). Get a key: https://tnt-audit.com/risk-api
//
// Usage: node risk-check-example.js <mint_address>

require('dotenv').config();

const RISK_API_URL = 'https://tnt-audit.com/api/v1/token-risk';

async function checkTokenRisk(mint, maxClusterPercent = 50) {
  const headers = {};
  if (process.env.RISK_API_KEY) {
    headers.Authorization = `Bearer ${process.env.RISK_API_KEY}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${RISK_API_URL}?mint=${mint}`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`Risk API returned ${response.status}, skipping check`);
      return { ok: true, safetyScore: null, worstClusterPercent: 0 };
    }

    const data = await response.json();
    const clusters = data.insider_clusters ?? [];
    const worst = clusters.reduce((max, c) => Math.max(max, c.percent_of_supply ?? 0), 0);

    return {
      ok: worst <= maxClusterPercent,
      safetyScore: data.safety_score,
      worstClusterPercent: worst,
    };
  } catch (error) {
    // Fail open — safety-net check, never a hard dependency.
    console.warn('Risk check failed, skipping:', error.message);
    return { ok: true, safetyScore: null, worstClusterPercent: 0 };
  }
}

async function main() {
  const mint = process.argv[2];
  if (!mint) {
    console.log('Usage: node risk-check-example.js <mint_address>');
    process.exit(1);
  }

  const result = await checkTokenRisk(mint);
  console.log(`mint: ${mint}`);
  console.log(`safety_score: ${result.safetyScore}`);
  console.log(`worst insider cluster: ${result.worstClusterPercent.toFixed(1)}% of supply`);
  console.log(result.ok ? '-> PASS' : '-> FAIL (would skip this buy)');
}

main();
