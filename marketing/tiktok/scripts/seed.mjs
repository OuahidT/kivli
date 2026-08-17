// Seed Kivli demo data: merchant "Atelier Nova", program 8 passages, Léa + 12 clients.
const BASE = "http://localhost:3000";
let cookie = "";

async function api(path, body, opts = {}) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !opts.allow409) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

// 1. Merchant signup
const signup = await api("/api/merchant/signup", {
  firstName: "Camille",
  lastName: "Moreau",
  businessName: "Atelier Nova",
  email: "hello@atelier-nova.fr",
  phone: "0612345678",
  password: "KivliDemo2026",
});
const slug = signup.merchant.slug;
console.log("merchant slug:", slug);

// 2. Program: 8 passages, reward "Un avantage au choix", color #f05b3c
await api("/api/merchant/program", {
  name: "Ma carte fidélité",
  goal: 8,
  rewardText: "Un avantage au choix",
  accentColor: "#f05b3c",
});
console.log("program created");

// 3. Customers
const clients = [
  ["Léa", "lea.martin@gmail.com", 0, false],
  ["Emma", "emma.dubois@gmail.com", 5, false],
  ["Hugo", "hugo.leroy@gmail.com", 2, false],
  ["Chloé", "chloe.bernard@gmail.com", 7, false],
  ["Lucas", "lucas.petit@gmail.com", 11, "redeem"],
  ["Inès", "ines.moreau@gmail.com", 4, false],
  ["Nathan", "nathan.roux@gmail.com", 1, false],
  ["Sarah", "sarah.fournier@gmail.com", 6, false],
  ["Tom", "tom.girard@gmail.com", 9, false],
  ["Jade", "jade.lambert@gmail.com", 3, false],
  ["Louis", "louis.bonnet@gmail.com", 14, "redeem"],
  ["Zoé", "zoe.francois@gmail.com", 2, false],
  ["Maxime", "maxime.martinez@gmail.com", 5, false],
];

const codes = {};
for (const [firstName, email, target, redeem] of clients) {
  const join = await api(`/api/join/${slug}`, { firstName, email });
  codes[firstName] = join.code;
  let remaining = target;
  while (remaining > 0) {
    const quantity = Math.min(10, remaining);
    await api("/api/merchant/stamp", {
      code: join.code,
      quantity,
      requestId: crypto.randomUUID(),
      confirmMultiple: true,
      confirmRecent: true,
    });
    remaining -= quantity;
  }
  if (redeem === "redeem") {
    await api("/api/merchant/redeem", { code: join.code });
  }
  console.log(firstName, join.code, "->", target, redeem ? "(reward redeemed)" : "");
}

import { writeFileSync } from "node:fs";
writeFileSync(new URL("./seed-state.json", import.meta.url), JSON.stringify({ slug, cookie, codes }, null, 2));
console.log("DONE");
