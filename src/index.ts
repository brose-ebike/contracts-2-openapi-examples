import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

interface CompiledPath {
  originalPath: string;
  regex: RegExp;
}

function openapiPathToRegex(openApiPath: string): RegExp {
  const parts = openApiPath.split(/(\{[^}]+\})/g);
  const regexParts = parts.map(part => {
    if (part.startsWith('{') && part.endsWith('}')) {
      return '[^/]+'; 
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return new RegExp(`^${regexParts.join('')}$`);
}

function injectResponseExample(methodSpec: any, status: string, exampleName: string, value: any): void {
  if (!methodSpec.responses) methodSpec.responses = {};
  if (!methodSpec.responses[status]) methodSpec.responses[status] = {};
  
  const responseStatus = methodSpec.responses[status];
  if (!responseStatus.content) responseStatus.content = { 'application/json': {} };
  
  const mediaType = Object.keys(responseStatus.content)[0] || 'application/json';
  if (!responseStatus.content[mediaType]) responseStatus.content[mediaType] = {};
  
  const mediaObj = responseStatus.content[mediaType];
  if (!mediaObj.examples) mediaObj.examples = {};
  
  mediaObj.examples[exampleName] = { value };
}

function injectRequestExample(methodSpec: any, exampleName: string, value: any): void {
  if (!methodSpec.requestBody) return; 
  if (!methodSpec.requestBody.content) methodSpec.requestBody.content = { 'application/json': {} };
  
  const mediaType = Object.keys(methodSpec.requestBody.content)[0] || 'application/json';
  if (!methodSpec.requestBody.content[mediaType]) methodSpec.requestBody.content[mediaType] = {};
  
  const mediaObj = methodSpec.requestBody.content[mediaType];
  if (!mediaObj.examples) mediaObj.examples = {};
  
  mediaObj.examples[exampleName] = { value };
}

function walkDir(dir: string, filterExts: string[]): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of list) {
    const resPath = path.resolve(dir, file.name);
    if (file.isDirectory()) {
      results = results.concat(walkDir(resPath, filterExts));
    } else if (file.isFile() && filterExts.some(ext => file.name.endsWith(ext))) {
      results.push(resPath);
    }
  }
  return results;
}

async function run(): Promise<void> {
  try {
    const openapiPath = core.getInput('openapi-path');
    const contractsDir = core.getInput('contracts-dir');

    if (!fs.existsSync(openapiPath)) {
      throw new Error(`OpenAPI file not found at path: ${openapiPath}`);
    }
    if (!fs.existsSync(contractsDir)) {
      throw new Error(`Contracts directory not found at path: ${contractsDir}`);
    }

    // 1. Load OpenAPI Specification
    const openapiRaw = fs.readFileSync(openapiPath, 'utf8');
    const openapiSpec = JSON.parse(openapiRaw);
    const pathsSpec = openapiSpec.paths || {};

    // 2. Pre-compile OpenAPI paths into Regex patterns
    const compiledPaths: CompiledPath[] = Object.keys(pathsSpec).map(oaPath => ({
      originalPath: oaPath,
      regex: openapiPathToRegex(oaPath)
    }));

    // 3. Find all contract files recursively
    const contractFiles = walkDir(contractsDir, ['.yml', '.yaml']);
    let matchedCount = 0;
    let skippedCount = 0;

    for (const filePath of contractFiles) {
      const exampleName = path.basename(filePath, path.extname(filePath));
      const fileContent = fs.readFileSync(filePath, 'utf8');

      try {
        const docs = yaml.loadAll(fileContent) as any[];
        
        for (const doc of docs) {
          if (!doc) continue;
          const contracts = Array.isArray(doc) ? doc : [doc];

          for (const contract of contracts) {
            const request = contract.request || {};
            const response = contract.response || {};

            const method = (request.method || '').toLowerCase();
            const urlRaw = request.url || request.urlPath;

            if (!method || !urlRaw) continue;

            // Strip query params if they exist in 'url'
            const contractPath = String(urlRaw).split('?')[0];

            // Match against compiled openapi regexes
            let matchedPath: string | null = null;
            for (const item of compiledPaths) {
              if (item.regex.test(contractPath)) {
                if (pathsSpec[item.originalPath] && pathsSpec[item.originalPath][method]) {
                  matchedPath = item.originalPath;
                  break;
                }
              }
            }

            if (!matchedPath) {
              core.info(`⚠️ No match found for contract: [${method.toUpperCase()}] ${contractPath} in ${path.basename(filePath)}`);
              skippedCount++;
              continue;
            }

            const methodSpec = pathsSpec[matchedPath][method];

            // Inject Request Body Example
            if (request.body) {
              injectRequestExample(methodSpec, `${exampleName}_req`, request.body);
            }

            // Inject Response Body Example
            if (response.body) {
              const status = String(response.status || 200);
              injectResponseExample(methodSpec, status, `${exampleName}_res`, response.body);
            }

            core.info(`✅ Matched & Applied: [${method.toUpperCase()}] ${contractPath} -> ${matchedPath}`);
            matchedCount++;
          }
        }
      } catch (err: any) {
        core.warning(`❌ Error parsing YAML file ${filePath}: ${err.message}`);
      }
    }

    // 4. Write modified specification back
    fs.writeFileSync(openapiPath, JSON.stringify(openapiSpec, null, 2), 'utf8');
    core.info(`\nProcessing complete. Matched: ${matchedCount}, Skipped: ${skippedCount}. Saved to ${openapiPath}`);

  } catch (error: any) {
    core.setFailed(`Action failed with error: ${error.message}`);
  }
}

run();