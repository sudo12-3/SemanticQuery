const QueryProcessor = require('./queryProcessor');

async function runDemo() {
  const processor = new QueryProcessor('./categorized_rules.json');
  
  try {
    // Initialize the processor
    await processor.initialize();
    
    console.log('\n=== Testing with rule-violating query (should be fast) ===');
    const startViolating = process.hrtime.bigint();
    const badSelectQuery = "SELECT * FROM test_table WHERE value = 3";
    const badSelectResult = await processor.processQuery(badSelectQuery);
    const endViolating = process.hrtime.bigint();
    const violatingTimeMs = Number(endViolating - startViolating) / 1000000;
    
    console.log('Result:', badSelectResult);
    console.log(`Execution time: ${violatingTimeMs.toFixed(2)}ms`);
    
    console.log('\n=== Testing with valid query (should access database) ===');
    const startValid = process.hrtime.bigint();
    const goodSelectQuery = "SELECT * FROM test_table WHERE value = 10";
    const goodSelectResult = await processor.processQuery(goodSelectQuery);
    const endValid = process.hrtime.bigint();
    const validTimeMs = Number(endValid - startValid) / 1000000;
    
    console.log('Result:', goodSelectResult);
    console.log(`Execution time: ${validTimeMs.toFixed(2)}ms`);
    
    console.log('\n=== Performance comparison ===');
    console.log(`Rule-based rejection: ${violatingTimeMs.toFixed(2)}ms`);
    console.log(`Database query: ${validTimeMs.toFixed(2)}ms`);
    if (violatingTimeMs < validTimeMs) {
      const speedup = (validTimeMs / violatingTimeMs).toFixed(2);
      console.log(`Rule-based filtering is ${speedup}x faster than database access`);
    }
    
  } catch (error) {
    console.error('Demo error:', error);
  } finally {
    await processor.close();
  }
}

runDemo().catch(console.error);