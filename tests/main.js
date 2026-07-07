const fs = require('fs');
const path = require('path');

// 1. Simulate the GitHub Action environment inputs
// We set both dash and underscore variants to account for local shell differences
process.env['INPUT_OPENAPI-PATH'] = './tests/fixtures/openapi-copy.json';
process.env['INPUT_OPENAPI_PATH'] = './tests/fixtures/openapi-copy.json';

process.env['INPUT_CONTRACTS-DIR'] = './tests/fixtures/contracts';
process.env['INPUT_CONTRACTS_DIR'] = './tests/fixtures/contracts';

console.log("🚀 Starting local GitHub Action simulation...\n");

// 2. Execute your compiled bundle
try {
  // Copy the openapi.json to openapi-copy.json to avoid modifying the original during the test
  const originalOpenApiPath = path.resolve('./tests/fixtures/openapi.json');
  const copyOpenApiPath = path.resolve('./tests/fixtures/openapi-copy.json');
  fs.copyFileSync(originalOpenApiPath, copyOpenApiPath);
  console.log(`📄 Copied ${originalOpenApiPath} to ${copyOpenApiPath} for testing.`);

  // Execute the main function from your compiled bundle
  require('../out/main/index.js');
  
  // 3. Post-execution verification
  console.log("\n🔍 Verifying modifications to tests/fixtures/openapi.json...");
  const updatedOpenApi = JSON.parse(fs.readFileSync('./tests/fixtures/openapi.json', 'utf8'));
  
  const targetResponse = updatedOpenApi.paths['/api/v1/users/{userId}']['get']['responses']['200'];
  
  if (targetResponse.content && targetResponse.content['application/json'].examples) {
    console.log("✅ SUCCESS: Examples were injected successfully!");
    console.log(JSON.stringify(targetResponse.content['application/json'].examples, null, 2));
  } else {
    console.error("❌ FAILURE: OpenAPI file was not modified correctly.");
  }
} catch (error) {
  console.error("❌ Test crashed with error:", error);
}