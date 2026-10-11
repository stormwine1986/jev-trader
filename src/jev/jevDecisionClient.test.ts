import assert from "node:assert/strict";
import { test } from "node:test";
import { JevDecisionClient } from "./jevDecisionClient.ts";

const apiKey = process.env.TYPESAFE_API_KEY;

test(
  "makes an authenticated online Jev decision",
  { skip: !apiKey && "TYPESAFE_API_KEY is not set" },
  async () => {
    const client = new JevDecisionClient({ apiKey: apiKey! });
    const decision = await client.decide({
      state: "The shipment is late. Please resolve this today; it is urgent.",
      questions: {
        urgency: {
          type: "noul",
          instructions: "Does this message express urgency?",
          criteria: {
            true: "It explicitly requests timely action",
            false: "It does not express time pressure",
          },
        },
      },
    });

    console.log("Jev response body:", JSON.stringify(decision, null, 2));
    assert.ok(decision.model.length > 0);
    assert.equal(decision.answers.urgency.type, "noul");
    assert.ok(decision.answers.urgency.noul >= 0);
    assert.ok(decision.answers.urgency.noul <= 1);
    assert.ok(decision.usage.input_tokens > 0);
    assert.ok(decision.usage.output_tokens >= 0);
  },
);
