# Contracts 2 OpenAPI Examples

A custom GitHub Action that recursively walks through a Spring Cloud Contract test directory, 
automatically maps contract expectations to their corresponding endpoints in an OpenAPI documentation file, 
and injects them as native OpenAPI request and response examples.

This action solves the tricky problem of matching literal contract test paths (e.g., `/api/v1/users/123/orders/abc-987`) with generic OpenAPI path templates containing placeholders (e.g., `/api/v1/users/{userId}/orders/{orderId}`).

## 🚀 Features

* **Smart Path Matching:** Dynamic translation of OpenAPI template placeholders into strictly isolated regular expressions for literal string validation.
* **Method Verification:** Validates that the contract's HTTP method (`GET`, `POST`, etc.) matches the exact route specification.
* **Safe Injection:** Safely initializes deeply nested `content -> application/json -> examples` OpenAPI blocks without wiping out existing documentation structure.
* **Isolation handling:** Strips query parameters from contract endpoints automatically to ensure robust regex execution.

---

## 🛠️ Usage

To use this action in your pipeline, include it in your GitHub Workflow file (e.g., `.github/workflows/documentation.yml`) after generating your primary OpenAPI specification file.

```yaml
name: Generate Documentation

on:
  push:
    branches: [ main ]

jobs:
  build-and-document:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      # 1. Run your build/plugins to generate your raw OpenAPI JSON file first
      # Example: ./gradlew openapi3

      # 2. Inject the Spring Cloud Contract examples
      - name: Inject Contract Examples to OpenAPI Spec
        uses: your-github-organization/contracts-2-openapi-examples@main
        with:
          contracts-dir: './contracts'
          openapi-path: './openapi.json'