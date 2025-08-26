const { logger } = require('@librechat/data-schemas');
const axios = require('axios');

/**
 * Contact Locator
 * Finds appropriate experts based on query context and knowledge gaps
 */
class ContactLocator {
  constructor(config) {
    this.config = config;
    this.employeeDirectory = config.employeeDirectory;
    this.expertiseMap = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize the contact locator
   */
  async initialize() {
    try {
      logger.info('Initializing Contact Locator...');

      // Load employee directory if available
      if (this.employeeDirectory.enabled && this.employeeDirectory.apiUrl) {
        await this.loadEmployeeDirectory();
      }

      // Initialize expertise mapping
      this.initializeExpertiseMap();

      this.isInitialized = true;
      logger.info('Contact Locator initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Contact Locator:', error);
      throw error;
    }
  }

  /**
   * Find an appropriate expert for a query
   * @param {string} query - User query
   * @param {Object} gapAnalysis - Knowledge gap analysis
   * @returns {Promise<Object|null>} - Expert contact information
   */
  async findExpert(query, gapAnalysis) {
    try {
      logger.debug(`Finding expert for query: "${query}"`);

      // Analyze query to determine domain/expertise needed
      const queryAnalysis = this.analyzeQueryDomain(query);
      
      // Find expert based on domain and gap type
      let expert = await this.findExpertByDomain(queryAnalysis.domain, queryAnalysis.keywords);

      // Fallback to default contacts if no specific expert found
      if (!expert) {
        expert = this.getDefaultContact(queryAnalysis.domain, gapAnalysis.gapType);
      }

      if (expert) {
        logger.info(`Found expert: ${expert.name} for domain: ${queryAnalysis.domain}`);
      } else {
        logger.warn(`No expert found for query: "${query}"`);
      }

      return expert;
    } catch (error) {
      logger.error('Failed to find expert:', error);
      return null;
    }
  }

  /**
   * Analyze query to determine domain and keywords
   * @param {string} query - User query
   * @returns {Object} - Query analysis
   */
  analyzeQueryDomain(query) {
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(' ').filter(word => word.length > 2);

    // Domain classification based on keywords
    const domainKeywords = {
      hr: ['hr', 'human', 'resources', 'employee', 'staff', 'leave', 'vacation', 'policy', 'payroll', 'benefits', 'recruitment', 'hiring'],
      it: ['it', 'technology', 'computer', 'software', 'hardware', 'network', 'wifi', 'password', 'access', 'system', 'server', 'email'],
      finance: ['finance', 'financial', 'money', 'budget', 'expense', 'cost', 'payment', 'invoice', 'accounting', 'revenue'],
      admin: ['admin', 'administration', 'office', 'facility', 'building', 'meeting', 'room', 'booking', 'supplies'],
      legal: ['legal', 'contract', 'agreement', 'compliance', 'regulation', 'law', 'terms', 'privacy'],
      operations: ['operations', 'process', 'procedure', 'workflow', 'business', 'project', 'management'],
      general: [], // catch-all
    };

    let bestDomain = 'general';
    let maxMatches = 0;

    for (const [domain, domainWords] of Object.entries(domainKeywords)) {
      const matches = keywords.filter(keyword => 
        domainWords.some(domainWord => 
          keyword.includes(domainWord) || domainWord.includes(keyword)
        )
      ).length;

      if (matches > maxMatches) {
        maxMatches = matches;
        bestDomain = domain;
      }
    }

    return {
      domain: bestDomain,
      keywords: keywords,
      confidence: maxMatches / keywords.length,
    };
  }

  /**
   * Find expert by domain
   * @param {string} domain - Domain/department
   * @param {Array} keywords - Query keywords
   * @returns {Promise<Object|null>} - Expert information
   */
  async findExpertByDomain(domain, keywords) {
    try {
      // Check expertise map first
      const experts = this.expertiseMap.get(domain) || [];
      
      if (experts.length === 0) {
        return null;
      }

      // Score experts based on keyword match
      const scoredExperts = experts.map(expert => {
        const expertKeywords = expert.expertise || [];
        const matchScore = keywords.filter(keyword =>
          expertKeywords.some(expertise => 
            expertise.toLowerCase().includes(keyword) || keyword.includes(expertise.toLowerCase())
          )
        ).length;

        return {
          ...expert,
          matchScore: matchScore,
        };
      });

      // Sort by match score and availability
      scoredExperts.sort((a, b) => {
        if (a.matchScore !== b.matchScore) {
          return b.matchScore - a.matchScore;
        }
        return (a.responseTime || 999) - (b.responseTime || 999);
      });

      // Return best match if any
      return scoredExperts.length > 0 ? scoredExperts[0] : null;
    } catch (error) {
      logger.error(`Failed to find expert by domain ${domain}:`, error);
      return null;
    }
  }

  /**
   * Get default contact for domain
   * @param {string} domain - Domain/department
   * @param {string} gapType - Type of knowledge gap
   * @returns {Object|null} - Default contact
   */
  getDefaultContact(domain, gapType) {
    const defaultContacts = this.employeeDirectory.defaultContacts;

    // Map domain to default contact
    const domainMapping = {
      hr: defaultContacts.hr,
      it: defaultContacts.it,
      admin: defaultContacts.admin,
      finance: defaultContacts.admin, // Fallback to admin
      legal: defaultContacts.admin,   // Fallback to admin
      operations: defaultContacts.admin, // Fallback to admin
      general: defaultContacts.admin, // Default fallback
    };

    const contact = domainMapping[domain] || defaultContacts.admin;

    if (contact) {
      return {
        id: `default_${domain}`,
        name: contact.name,
        email: contact.email,
        slack: contact.slack,
        domain: domain,
        type: 'default_contact',
        responseTime: 240, // 4 hours default
        expertise: [domain],
      };
    }

    return null;
  }

  /**
   * Load employee directory from API
   */
  async loadEmployeeDirectory() {
    try {
      if (!this.employeeDirectory.apiUrl) {
        logger.warn('Employee directory API URL not configured');
        return;
      }

      logger.info('Loading employee directory...');

      const response = await axios.get(this.employeeDirectory.apiUrl, {
        headers: {
          'Authorization': `Bearer ${this.employeeDirectory.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      const employees = response.data;
      this.processEmployeeDirectory(employees);

      logger.info(`Loaded ${employees.length} employees from directory`);
    } catch (error) {
      logger.warn('Failed to load employee directory, using defaults:', error.message);
      // Continue with default contacts
    }
  }

  /**
   * Process employee directory data
   * @param {Array} employees - Employee data
   */
  processEmployeeDirectory(employees) {
    // Clear existing expertise map
    this.expertiseMap.clear();

    employees.forEach(employee => {
      if (!employee.department || !employee.email) {
        return; // Skip incomplete entries
      }

      const domain = this.mapDepartmentToDomain(employee.department);
      if (!this.expertiseMap.has(domain)) {
        this.expertiseMap.set(domain, []);
      }

      const expert = {
        id: employee.id || employee.email,
        name: employee.name || employee.full_name,
        email: employee.email,
        slack: employee.slack_handle,
        department: employee.department,
        domain: domain,
        type: 'employee',
        responseTime: employee.response_time || 240, // Default 4 hours
        expertise: employee.expertise || employee.skills || [employee.department],
        availability: employee.availability || 'available',
      };

      this.expertiseMap.get(domain).push(expert);
    });
  }

  /**
   * Map department names to domains
   * @param {string} department - Department name
   * @returns {string} - Mapped domain
   */
  mapDepartmentToDomain(department) {
    const departmentLower = department.toLowerCase();

    if (departmentLower.includes('hr') || departmentLower.includes('human')) {
      return 'hr';
    }
    if (departmentLower.includes('it') || departmentLower.includes('tech')) {
      return 'it';
    }
    if (departmentLower.includes('finance') || departmentLower.includes('accounting')) {
      return 'finance';
    }
    if (departmentLower.includes('admin') || departmentLower.includes('operations')) {
      return 'admin';
    }
    if (departmentLower.includes('legal')) {
      return 'legal';
    }

    return 'general';
  }

  /**
   * Initialize default expertise map
   */
  initializeExpertiseMap() {
    // Initialize with default contacts if no employee directory is available
    const defaults = this.employeeDirectory.defaultContacts;

    ['hr', 'it', 'admin'].forEach(domain => {
      if (defaults[domain]) {
        this.expertiseMap.set(domain, [{
          id: `default_${domain}`,
          name: defaults[domain].name,
          email: defaults[domain].email,
          slack: defaults[domain].slack,
          domain: domain,
          type: 'default_contact',
          responseTime: 240,
          expertise: [domain],
        }]);
      }
    });
  }

  /**
   * Add or update expert information
   * @param {Object} expert - Expert information
   */
  addExpert(expert) {
    try {
      const domain = expert.domain || 'general';
      
      if (!this.expertiseMap.has(domain)) {
        this.expertiseMap.set(domain, []);
      }

      const experts = this.expertiseMap.get(domain);
      const existingIndex = experts.findIndex(e => e.id === expert.id);

      if (existingIndex >= 0) {
        experts[existingIndex] = expert;
      } else {
        experts.push(expert);
      }

      logger.debug(`Added/updated expert: ${expert.name} in domain: ${domain}`);
    } catch (error) {
      logger.error('Failed to add expert:', error);
    }
  }

  /**
   * Get all experts for a domain
   * @param {string} domain - Domain name
   * @returns {Array} - List of experts
   */
  getExpertsByDomain(domain) {
    return this.expertiseMap.get(domain) || [];
  }

  /**
   * Get statistics about available experts
   * @returns {Object} - Expert statistics
   */
  getStatistics() {
    const stats = {
      totalExperts: 0,
      expertsByDomain: {},
    };

    for (const [domain, experts] of this.expertiseMap.entries()) {
      stats.expertsByDomain[domain] = experts.length;
      stats.totalExperts += experts.length;
    }

    return stats;
  }

  /**
   * Close the contact locator
   */
  async close() {
    this.expertiseMap.clear();
    this.isInitialized = false;
    logger.info('Contact Locator closed');
  }
}

module.exports = ContactLocator;
