require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs').promises;
const { Parser } = require('node-sql-parser');

const connectionString = process.env.DATABASE_URL;
const parser = new Parser();

class QueryProcessor {
  constructor(rulesPath) {
    this.rulesPath = rulesPath;
    this.rules = null;
    this.client = new Client({ connectionString });
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      // Load rules from JSON file
      const data = await fs.readFile(this.rulesPath, 'utf8');
      this.rules = JSON.parse(data);
      
      // Connect to database
      await this.client.connect();
      console.log('QueryProcessor initialized successfully');
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize QueryProcessor:', error);
      throw error;
    }
  }

  /**
   * Process a SQL query through rule checking before execution
   * @param {string} sqlQuery - The SQL query to process
   * @returns {object} - Query results or rule violation information
   */
  async processQuery(sqlQuery) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Parse the SQL query
      const parsedQuery = parser.astify(sqlQuery);
      
      // Determine query type
      const queryType = this.getQueryType(parsedQuery);
      
      // Get applicable rules for this query type
      const applicableRules = this.getApplicableRules(queryType);
      
      if (!applicableRules || applicableRules.length === 0) {
        // No rules apply, just execute the query
        console.log('No applicable rules found, executing query directly');
        return await this.executeQuery(sqlQuery);
      }
      
      // Extract table and conditions from the query
      const { table, conditions } = this.extractQueryDetails(parsedQuery);
      
      // Find rules that apply to this specific table
      const tableRules = applicableRules.filter(rule => rule.table === table);
      
      if (tableRules.length === 0) {
        // No rules for this table, execute query
        console.log(`No rules found for table ${table}, executing query directly`);
        return await this.executeQuery(sqlQuery);
      }
      
      // Check if any rule would be violated by this query
      const violatedRule = this.checkRuleViolations(tableRules, conditions, queryType);
      
      if (violatedRule) {
        // A rule would be violated, return empty result with explanation
        console.log(`Query violates rule: ${violatedRule.rule}`);
        return {
          success: false,
          rows: [],
          violated_rule: violatedRule,
          message: `Query violates rule: ${violatedRule.rule}`
        };
      }
      
      // No violations, execute the query
      console.log('No rule violations found, executing query');
      return await this.executeQuery(sqlQuery);
      
    } catch (error) {
      console.error('Error processing query:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Determine the type of query (INSERT, UPDATE, SELECT, etc.)
   */
  getQueryType(ast) {
    if (!ast) return null;
    
    // The AST's type indicates the query type
    if (ast.type === 'insert') return 'insert';
    if (ast.type === 'update') return 'update';
    if (ast.type === 'select') return 'select';
    if (ast.type === 'delete') return 'delete';
    
    return null;
  }

  /**
   * Get rules applicable to the current query type
   */
  getApplicableRules(queryType) {
    if (!this.rules) return [];
    
    switch (queryType) {
      case 'insert':
        return this.rules.insert;
      case 'update':
        return this.rules.update;
      case 'select':
        // For SELECT, we use the same rules as used for updates
        // since they represent what data should be accessible
        return this.rules.update;
      case 'delete':
        // For DELETE, we also use update rules
        return this.rules.update;
      default:
        return [];
    }
  }

  /**
   * Extract table name and conditions from the query
   */
  extractQueryDetails(ast) {
    if (!ast) return { table: null, conditions: [] };
    
    let table = null;
    let conditions = [];
    
    // Extract table name based on query type
    if (ast.type === 'insert' && ast.table) {
      table = ast.table[0].table;
    } else if (ast.type === 'update' && ast.table) {
      table = ast.table[0].table;
    } else if (ast.type === 'select' && ast.from) {
      table = ast.from[0].table;
    } else if (ast.type === 'delete' && ast.from) {
      table = ast.from[0].table;
    }
    
    // Extract conditions
    if (ast.where) {
      // Debug AST structure
      console.log('WHERE clause AST:', JSON.stringify(ast.where, null, 2));
      conditions = this.extractConditions(ast.where);
    }
    
    // For INSERT, extract values
    if (ast.type === 'insert' && ast.values) {
      // Handle column-value mapping for inserts
      const columns = ast.columns || [];
      const values = ast.values[0].value || [];
      
      for (let i = 0; i < columns.length; i++) {
        conditions.push({
          column: columns[i],
          operator: '=',
          value: values[i]
        });
      }
    }
    
    console.log('Extracted conditions:', JSON.stringify(conditions));
    return { table, conditions };
  }

  /**
   * Recursively extract conditions from WHERE clause
   */
  extractConditions(whereClause, conditions = []) {
    console.log('Extracting conditions from:', JSON.stringify(whereClause, null, 2));
    
    if (!whereClause) return conditions;
    
    // Handle simple binary expressions (e.g., "column = value")
    if (whereClause.type === 'binary_expr') {
      if (whereClause.operator === 'AND' || whereClause.operator === 'OR') {
        // Recursive extraction for AND/OR conditions
        this.extractConditions(whereClause.left, conditions);
        this.extractConditions(whereClause.right, conditions);
      } else {
        // This is a simple condition like "column = value"
        if (whereClause.left && whereClause.right) {
          let column = null;
          
          // Handle different AST structures for column references
          if (typeof whereClause.left === 'string') {
            column = whereClause.left;
          } else if (whereClause.left.column) {
            column = whereClause.left.column;
          } else if (whereClause.left.value) {
            column = whereClause.left.value;
          }
          
          let value = null;
          if (whereClause.right.value !== undefined) {
            value = whereClause.right.value;
          } else if (whereClause.right.column) {
            value = whereClause.right.column;
          }
          
          if (column && whereClause.operator) {
            conditions.push({
              column: column,
              operator: whereClause.operator,
              value: value
            });
          }
        }
      }
    }
    
    return conditions;
  }

  /**
   * Check if the query conditions would violate any rules
   * @param {Array} rules - Rules to check against
   * @param {Array} conditions - Query conditions
   * @param {string} queryType - Type of query (select, insert, update, delete)
   * @returns {object|null} - Violated rule or null
   */
  checkRuleViolations(rules, conditions, queryType = 'insert') {
    // For SELECT queries, we handle differently - the condition must satisfy the rule
    if (queryType === 'select') {
      return this.checkSelectViolations(rules, conditions);
    }

    // For other queries (INSERT, UPDATE), check direct rule violations
    for (const rule of rules) {
      // Parse the rule into components (format: "attribute operator value")
      const ruleParts = rule.rule.match(/(\w+)\s+([<>=!]{1,2})\s+(.+)/);
      
      if (!ruleParts) continue;
      
      const [_, ruleAttribute, ruleOperator, ruleValue] = ruleParts;
      
      // Check if any condition would violate this rule
      for (const condition of conditions) {
        if (condition.column === ruleAttribute) {
          // Found a condition on the same attribute as the rule
          if (this.wouldViolateRule(condition.operator, condition.value, ruleOperator, ruleValue)) {
            return rule;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Special check for SELECT queries - conditions must conform to rules
   * @param {Array} rules - Rules to check against
   * @param {Array} conditions - Query conditions
   * @returns {object|null} - Violated rule or null
   */
  checkSelectViolations(rules, conditions) {
    console.log("Checking SELECT violations with conditions:", JSON.stringify(conditions));
    
    // Group rules by attribute for easier lookup
    const rulesByAttribute = {};
    for (const rule of rules) {
      const ruleParts = rule.rule.match(/(\w+)\s+([<>=!]{1,2})\s+(.+)/);
      if (!ruleParts) continue;
      
      const [_, ruleAttribute, ruleOperator, ruleValue] = ruleParts;
      
      if (!rulesByAttribute[ruleAttribute]) {
        rulesByAttribute[ruleAttribute] = [];
      }
      rulesByAttribute[ruleAttribute].push({
        operator: ruleOperator,
        value: this.normalizeValue(ruleValue),
        originalRule: rule
      });
    }
    
    console.log("Rules by attribute:", JSON.stringify(rulesByAttribute));
    
    // If no WHERE conditions, check if there are any rules
    if (conditions.length === 0 && Object.keys(rulesByAttribute).length > 0) {
      console.log("No WHERE conditions found, but rules exist - violation");
      return Object.values(rulesByAttribute)[0][0].originalRule;
    }
    
    // Create a map of attributes mentioned in the query
    const mentionedAttributes = new Set(conditions.map(c => c.column));
    
    // For each mentioned attribute, check if its conditions satisfy the rules
    for (const attribute of mentionedAttributes) {
      // If this attribute has rules, check them
      if (rulesByAttribute[attribute]) {
        const rulesForAttribute = rulesByAttribute[attribute];
        const conditionsForAttribute = conditions.filter(c => c.column === attribute);
        
        // Check each rule for this attribute
        for (const rule of rulesForAttribute) {
          let ruleSatisfied = false;
          
          for (const condition of conditionsForAttribute) {
            console.log(`Checking if condition ${condition.column} ${condition.operator} ${condition.value} satisfies rule ${rule.operator} ${rule.value}`);
            
            if (this.selectConditionSatisfiesRule(
              condition.operator, 
              this.normalizeValue(condition.value), 
              rule.operator, 
              rule.value
            )) {
              console.log("Rule satisfied!");
              ruleSatisfied = true;
              break;
            }
          }
          
          // If no condition satisfies this rule, it's a violation
          if (!ruleSatisfied) {
            console.log(`No condition satisfies rule ${rule.operator} ${rule.value} - violation`);
            return rule.originalRule;
          }
        }
      }
    }
    
    // If we made it here, all mentioned attributes satisfy their rules
    console.log("All rules for mentioned attributes satisfied - no violations");
    return null;
  }

  /**
   * Check if a SELECT condition satisfies a rule
   * @param {string} condOp - Condition operator
   * @param {any} condVal - Condition value
   * @param {string} ruleOp - Rule operator
   * @param {any} ruleVal - Rule value
   * @returns {boolean} - Whether condition satisfies rule
   */
  selectConditionSatisfiesRule(condOp, condVal, ruleOp, ruleVal) {
    console.log(`Checking if ${condOp} ${condVal} satisfies rule ${ruleOp} ${ruleVal}`);
    
    // Handle operator combinations specifically for your "value > 4" rule
    
    // For equality condition (WHERE value = X)
    if (condOp === '=') {
      // If rule is "value > 4", then value must be > 4
      if (ruleOp === '>') {
        return condVal > ruleVal;
      }
      // If rule is "value >= 4", then value must be >= 4
      if (ruleOp === '>=') {
        return condVal >= ruleVal;
      }
      // If rule is "value < 4", then value must be < 4
      if (ruleOp === '<') {
        return condVal < ruleVal;
      }
      // If rule is "value <= 4", then value must be <= 4
      if (ruleOp === '<=') {
        return condVal <= ruleVal;
      }
    }
    
    // For "greater than" condition (WHERE value > X)
    if (condOp === '>') {
      // If rule is "value > 4", then any "value > X" where X >= 4 satisfies
      if (ruleOp === '>') {
        return condVal >= ruleVal;
      }
      // If rule is "value >= 4", then any "value > X" where X >= 3 satisfies
      if (ruleOp === '>=') {
        return condVal >= (ruleVal - 1);
      }
    }
    
    // For "greater than or equal" condition (WHERE value >= X)
    if (condOp === '>=') {
      // If rule is "value > 4", then any "value >= X" where X > 4 satisfies
      if (ruleOp === '>') {
        return condVal > ruleVal;
      }
      // If rule is "value >= 4", then any "value >= X" where X >= 4 satisfies
      if (ruleOp === '>=') {
        return condVal >= ruleVal;
      }
    }
    
    // For "less than" condition (WHERE value < X)
    if (condOp === '<') {
      // If rule is "value < 4", then any "value < X" where X <= 4 satisfies
      if (ruleOp === '<') {
        return condVal <= ruleVal;
      }
      // If rule is "value <= 4", then any "value < X" where X <= 5 satisfies
      if (ruleOp === '<=') {
        return condVal <= (ruleVal + 1);
      }
    }
    
    // For "less than or equal" condition (WHERE value <= X)
    if (condOp === '<=') {
      // If rule is "value < 4", then any "value <= X" where X < 4 satisfies
      if (ruleOp === '<') {
        return condVal < ruleVal;
      }
      // If rule is "value <= 4", then any "value <= X" where X <= 4 satisfies
      if (ruleOp === '<=') {
        return condVal <= ruleVal;
      }
    }
    
    // Special case for your scenario:
    // Verify ranges don't overlap with forbidden values
    
    // If rule is "value > 4" and we're checking "value = 3", should fail
    if (ruleOp === '>' && condOp === '=' && condVal <= ruleVal) {
      return false;
    }
    
    // Default fallback - be permissive if not explicitly handled
    console.log(`Condition combination not specifically handled: ${condOp} ${condVal} vs ${ruleOp} ${ruleVal}`);
    return true;
  }

  /**
   * Check if a specific condition would violate a rule
   */
  wouldViolateRule(conditionOp, conditionVal, ruleOp, ruleVal) {
    // Convert values to same type for comparison
    const ruleValue = this.normalizeValue(ruleVal);
    const condValue = this.normalizeValue(conditionVal);
    
    // Simple cases for exact rule violations
    if (ruleOp === '>' && conditionOp === '<=' && condValue <= ruleValue) {
      return true;
    }
    if (ruleOp === '>=' && conditionOp === '<' && condValue <= ruleValue) {
      return true;
    }
    if (ruleOp === '<' && conditionOp === '>=' && condValue >= ruleValue) {
      return true;
    }
    if (ruleOp === '<=' && conditionOp === '>' && condValue >= ruleValue) {
      return true;
    }
    
    // Equality cases
    if (ruleOp === '!=' && conditionOp === '=' && condValue === ruleValue) {
      return true;
    }
    if (ruleOp === '=' && conditionOp === '!=' && condValue !== ruleValue) {
      return true;
    }
    
    // More complex cases would need logical analysis
    
    return false;
  }

  /**
   * Convert string values to numbers if possible
   */
  normalizeValue(value) {
    if (typeof value === 'string') {
      // Remove quotes
      const cleaned = value.replace(/^['"](.*)['"]$/, '$1');
      
      // Try to convert to number
      const num = Number(cleaned);
      return isNaN(num) ? cleaned : num;
    }
    return value;
  }

  /**
   * Execute the SQL query against the database
   */
  async executeQuery(sqlQuery) {
    try {
      const result = await this.client.query(sqlQuery);
      return {
        success: true,
        rows: result.rows,
        rowCount: result.rowCount
      };
    } catch (error) {
      console.error('Database query error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.client) {
      await this.client.end();
      console.log('Database connection closed');
    }
  }
}

module.exports = QueryProcessor;