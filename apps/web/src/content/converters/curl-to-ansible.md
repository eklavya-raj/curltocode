---
slug: curl-to-ansible
title: cURL to Ansible uri Module Converter | CurlToCode
description: Convert cURL to an Ansible uri task with method, headers, authentication, exact or file bodies, forms, multipart files, and redirect policy.
heading: Convert cURL to Ansible
eyebrow: Declarative HTTP automation
lede: Generate a focused Ansible task using ansible.builtin.uri, keeping the HTTP request separate from playbook-specific hosts, variables, and secret management.
language: ansible
client: uri
languageLabel: Ansible
clientLabel: uri module
order: 110
faqs:
  - question: Does the output create a complete playbook?
    answer: It creates one reusable task, not an invented inventory, host group, privilege policy, or variable layout. Place it under the tasks section of the playbook that owns those operational choices.
  - question: How are redirects represented in ansible.builtin.uri?
    answer: follow_redirects is set to all for a command with -L and none otherwise, making the original command's policy explicit.
  - question: What request shapes are limited by YAML mappings?
    answer: The uri module uses mappings for headers and multipart field names, so duplicate names cannot be preserved and are reported instead of overwritten.
related:
  - curl-to-powershell
  - curl-to-httpie
  - curl-to-json
  - curl-to-k6
---

## A task, not an invented deployment

The output is one named `ansible.builtin.uri` task containing the URL, method,
headers, authentication, body, and redirect policy. CurlToCode does not guess an
inventory, hosts, roles, variables, or vault structure around it.

Credentials remain literal because generated output normally preserves input.
Move them to Ansible Vault or another secret source before committing a
playbook.

## Bodies and multipart data

Serialized request bodies remain exact. File-backed body data uses the module's
source capability. Multipart values select `form-multipart`, with file entries
carrying source paths and supported media types.

YAML and module mappings cannot hold repeated header or part names. Those inputs
return a limitation rather than silently keeping the final value.

## Redirect and status expectations

`follow_redirects` mirrors `-L`. The task does not invent `status_code`
acceptance or retries because those are workflow policies, not request facts
contained in cURL.
