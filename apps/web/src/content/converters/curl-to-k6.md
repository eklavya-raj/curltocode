---
slug: curl-to-k6
title: cURL to Grafana k6 Script Converter | CurlToCode
description: Convert cURL to a Grafana k6 JavaScript request script with exact bodies, headers, authentication, redirect limits, multipart files, and response checks.
heading: Convert cURL to k6
eyebrow: Load-test request script
lede: Generate a single-iteration k6 script that represents the request accurately, leaving virtual users, duration, thresholds, and scenarios to the test author.
language: k6
client: script
languageLabel: k6
clientLabel: load test script
order: 112
faqs:
  - question: Does the generated script define a load test scenario?
    answer: It defines the request in the default function but does not invent virtual users, stages, duration, thresholds, or arrival rates. Those choices affect systems and must come from the test plan.
  - question: Why is the redirect count explicit?
    answer: k6 follows redirects by default. A zero count matches cURL without -L, while a finite budget represents a command that opted into following.
  - question: Can k6 preserve repeated headers or multipart names?
    answer: Its high-level request parameters use JavaScript objects, so duplicate keys cannot be represented. The converter reports those cases instead of dropping values.
related:
  - curl-to-ansible
  - curl-to-nodejs
  - curl-to-json
  - curl-to-http
---

## One request, not an invented traffic model

The generated k6 module imports `http` and defines a default function that sends
the normalized request once per iteration. Request facts belong in conversion;
virtual-user counts, stage ramps, arrival rates, and thresholds belong in an
explicit load-test design.

Redirects use a numeric budget, and response status is available to the script
without adding application-specific assertions.

## Bodies and multipart files

Serialized content stays exact. Multipart output uses `http.file` for local
files and k6's form object for fields. The generated test process opens the file;
the CurlToCode browser session does not.

Headers and multipart values are object-shaped, so duplicate names cannot
survive. Those cases receive a controlled limitation.

Run the saved script with the k6 CLI after choosing responsible test targets and
load settings. The converter itself never executes it or contacts the URL.
