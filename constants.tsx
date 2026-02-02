

export const CATS_IN = [
  "Sales / Services",
  "Consulting / Freelance",
  "Product Sales",
  "Affiliate / Referral",
  "Interest / Bank",
  "Refunds",
  "Other Income"
];

export const CATS_OUT = [
  "Advertising / Marketing",
  "Software / SaaS",
  "Rent / Workspace",
  "Utilities",
  "Office Supplies",
  "Phone / Internet",
  "Travel",
  "Meals (Business)",
  "Professional Services",
  "Insurance",
  "Contractors",
  "Payroll",
  "Taxes & Licenses",
  "Equipment",
  "Shipping / Delivery",
  "Bank Fees",
  "Other Expense"
];

export const CATS_BILLING = [
  "Web Development",
  "Graphic Design",
  "Strategy Consulting",
  "Content Writing",
  "Digital Marketing",
  "Maintenance Retainer",
  "Software Licensing",
  "Project Milestone",
  "Training / Workshop",
  "Other Service"
];

export const DEFAULT_PAY_PREFS = [
  "Card", "Bank Transfer", "Cash", "PayPal", "Stripe", "Zelle", "Venmo", "Wise"
];

export const DB_KEY = "moniezi_v7_data";

// --- Tax Constants (2025 Estimates) ---
export const TAX_CONSTANTS = {
  // Estimated 2025 Standard Deductions
  STD_DEDUCTION_SINGLE: 15000, 
  STD_DEDUCTION_JOINT: 30000,
  STD_DEDUCTION_HEAD: 22500,
  // Self Employment Tax (Social Security 12.4% + Medicare 2.9%)
  SE_TAX_RATE: 0.153,
  // Only 92.35% of net earnings are subject to SE tax
  SE_TAXABLE_PORTION: 0.9235 
};

// --- Tax Planner Constants (2026 Estimates) ---
export const TAX_PLANNER_2026 = {
  STD_DEDUCTION_SINGLE: 16100,
  STD_DEDUCTION_JOINT: 32200,
  STD_DEDUCTION_HEAD: 24150,
  SE_TAX_RATE: 0.153
};

// --- Demo Data Generator ---
export const getFreshDemoData = () => {
  // Helper functions
  const randomDate = (daysAgo: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
  };

  const randomAmount = (min: number, max: number) => {
    return Math.round((Math.random() * (max - min) + min) * 100) / 100;
  };

  const randomFrom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  let idCounter = 1000;
  const generateId = (prefix: string) => `${prefix}_${idCounter++}`;

  const descriptions: Record<string, string[]> = {
    'Consulting / Freelance': ['Strategy consulting', 'Business analysis', 'Process optimization', 'Market research'],
    'Sales / Services': ['Web development', 'Mobile app', 'API integration', 'Database design'],
    'Product Sales': ['Online store sales', 'E-commerce revenue', 'Digital product sales'],
    'Advertising / Marketing': ['Google Ads', 'Facebook Ads', 'LinkedIn Premium', 'Instagram promotion'],
    'Software / SaaS': ['Adobe Creative Cloud', 'Microsoft 365', 'Slack Premium', 'Zoom Pro'],
    'Rent / Workspace': ['Office rent', 'Co-working space'],
    'Travel': ['Flight to client meeting', 'Hotel - conference', 'Rental car', 'Uber/Lyft'],
    'Meals (Business)': ['Client lunch', 'Team dinner', 'Coffee meeting', 'Conference meals'],
    'Equipment': ['Laptop', 'Monitor', 'Desk chair', 'External hard drive', 'Camera gear']
  };

  const clients = [
    'Acme Corporation', 'TechStart Inc', 'Global Ventures LLC', 'Digital Dreams Co',
    'Blue Ocean Partners', 'Summit Solutions', 'Nexus Technologies', 'Bright Future Consulting',
    'Metro Marketing Group', 'Apex Innovations', 'Stellar Systems', 'Prime Enterprises',
    'Fusion Creative', 'Quantum Analytics', 'Phoenix Group'
  ];

  // Generate 150 income transactions
  const incomeTransactions = [];
  for (let i = 0; i < 150; i++) {
    const category = randomFrom(CATS_IN);
    const daysAgo = Math.floor(Math.random() * 365);
    const amount = randomAmount(500, 8000);
    
    incomeTransactions.push({
      id: generateId('tx'),
      name: descriptions[category]?.[Math.floor(Math.random() * descriptions[category].length)] || 'Service provided',
      amount,
      category,
      date: randomDate(daysAgo),
      type: 'income' as const,
      notes: ''
    });
  }

  // Generate 180 expense transactions
  const expenseTransactions = [];
  for (let i = 0; i < 180; i++) {
    const category = randomFrom(CATS_OUT);
    const daysAgo = Math.floor(Math.random() * 365);
    let amount;
    
    if (category === 'Rent / Workspace') amount = randomAmount(1500, 3000);
    else if (category === 'Equipment') amount = randomAmount(300, 2500);
    else if (category === 'Insurance') amount = randomAmount(200, 800);
    else if (category === 'Software / SaaS') amount = randomAmount(15, 150);
    else if (category === 'Travel') amount = randomAmount(100, 1200);
    else if (category === 'Advertising / Marketing') amount = randomAmount(50, 1500);
    else amount = randomAmount(20, 500);
    
    expenseTransactions.push({
      id: generateId('tx'),
      name: descriptions[category]?.[Math.floor(Math.random() * descriptions[category].length)] || 'Business expense',
      amount,
      category,
      date: randomDate(daysAgo),
      type: 'expense' as const,
      notes: ''
    });
  }

  // Add recurring monthly expenses (12 months)
  const recurringExpenses = [
    { category: 'Rent / Workspace', amount: 2200, name: 'Office rent' },
    { category: 'Phone / Internet', amount: 149, name: 'Comcast Business' },
    { category: 'Software / SaaS', amount: 54.99, name: 'Adobe Creative Cloud' },
    { category: 'Software / SaaS', amount: 12.99, name: 'Microsoft 365' },
    { category: 'Insurance', amount: 385, name: 'Business insurance' }
  ];

  for (let month = 0; month < 12; month++) {
    recurringExpenses.forEach(expense => {
      expenseTransactions.push({
        id: generateId('tx'),
        name: expense.name,
        amount: expense.amount,
        category: expense.category,
        date: randomDate(month * 30 + Math.floor(Math.random() * 5)),
        type: 'expense' as const,
        notes: 'Recurring monthly expense'
      });
    });
  }

  // Generate 80 invoices
  const invoices = [];
  for (let i = 0; i < 80; i++) {
    const daysAgo = Math.floor(Math.random() * 365);
    const client = randomFrom(clients);
    const amount = randomAmount(1500, 15000);
    const dateIssued = randomDate(daysAgo);
    const dueDaysLater = 30 + Math.floor(Math.random() * 30);
    const dueDate = randomDate(daysAgo - dueDaysLater);
    
    let status: 'paid' | 'unpaid' | 'void';
    const rand = Math.random();
    if (daysAgo > 60) {
      status = rand < 0.8 ? 'paid' : (rand < 0.9 ? 'unpaid' : 'void');
    } else if (daysAgo > 30) {
      status = rand < 0.6 ? 'paid' : (rand < 0.85 ? 'unpaid' : 'void');
    } else {
      status = rand < 0.3 ? 'paid' : (rand < 0.95 ? 'unpaid' : 'void');
    }
    
    invoices.push({
      id: generateId('inv'),
      client,
      clientCompany: client,
      clientEmail: `contact@${client.toLowerCase().replace(/\s+/g, '')}.com`,
      clientAddress: `${Math.floor(Math.random() * 9000 + 1000)} Business Blvd, Suite ${Math.floor(Math.random() * 500)}`,
      amount,
      category: randomFrom(CATS_BILLING),
      description: randomFrom(['Consulting services', 'Web development', 'Design and branding', 'Marketing campaign', 'Software implementation']),
      date: dateIssued,
      due: dueDate,
      status,
      items: [
        {
          id: generateId('item'),
          description: 'Professional services rendered',
          quantity: 1,
          rate: amount
        }
      ],
      subtotal: amount,
      notes: '',
      discount: 0,
      taxRate: 0,
      shipping: 0,
      recurring: Math.random() < 0.15
    });
  }

  // Add specific overdue invoices
  const overdueInvoices = [
    { client: 'Tech Giants LLC', amount: 8500, daysOverdue: 15 },
    { client: 'Startup Ventures', amount: 6200, daysOverdue: 7 },
    { client: 'Enterprise Solutions', amount: 12000, daysOverdue: 45 }
  ];

  overdueInvoices.forEach(overdue => {
    const issueDate = randomDate(overdue.daysOverdue + 45);
    const dueDate = randomDate(overdue.daysOverdue);
    
    invoices.push({
      id: generateId('inv'),
      client: overdue.client,
      clientCompany: overdue.client,
      clientEmail: `billing@${overdue.client.toLowerCase().replace(/\s+/g, '')}.com`,
      clientAddress: `${Math.floor(Math.random() * 9000 + 1000)} Corporate Dr`,
      amount: overdue.amount,
      category: 'Consulting / Freelance',
      description: 'Professional services rendered',
      date: issueDate,
      due: dueDate,
      status: 'unpaid' as const,
      items: [
        {
          id: generateId('item'),
          description: 'Professional services',
          quantity: 1,
          rate: overdue.amount
        }
      ],
      subtotal: overdue.amount,
      notes: `OVERDUE ${overdue.daysOverdue} days - requires immediate attention`,
      discount: 0,
      taxRate: 0,
      shipping: 0,
      recurring: false
    });
  });

  // Generate tax payments
  const taxPayments = [];
  const quarters = [
    { month: 0, label: 'Q4 2025' },
    { month: 3, label: 'Q1 2026' },
    { month: 6, label: 'Q2 2026' },
    { month: 9, label: 'Q3 2026' }
  ];

  quarters.forEach(quarter => {
    const amount = randomAmount(3000, 8000);
    taxPayments.push({
      id: generateId('tax'),
      amount,
      date: randomDate(365 - (quarter.month * 30)),
      type: 'Estimated' as const,
      note: `${quarter.label} estimated tax payment`
    });
  });

  taxPayments.push({
    id: generateId('tax'),
    amount: randomAmount(8000, 15000),
    date: randomDate(350),
    type: 'Annual' as const,
    note: '2025 annual tax payment'
  });

  for (let i = 0; i < 5; i++) {
    taxPayments.push({
      id: generateId('tax'),
      amount: randomAmount(500, 3000),
      date: randomDate(Math.floor(Math.random() * 365)),
      type: 'Other' as const,
      note: 'Additional tax payment'
    });
  }

  // --- V7 Demo: Clients (Leads) + Estimates ---
  const computeTotal = (subtotal: number, discount = 0, taxRate = 0, shipping = 0) => {
    const afterDiscount = Math.max(0, subtotal - (discount || 0));
    const tax = (taxRate || 0) > 0 ? afterDiscount * ((taxRate || 0) / 100) : 0;
    return Math.round((afterDiscount + tax + (shipping || 0)) * 100) / 100;
  };

  const demoClients = [
    {
      id: 'cli_demo_1',
      name: 'Kenny Barria',
      company: 'KB Landscaping',
      email: 'kenny@example.com',
      phone: '+1 (555) 010-2001',
      address: '12 Palm St, Miami, FL',
      status: 'lead' as const,
      createdAt: randomDate(60),
      updatedAt: randomDate(2),
      notes: 'Requested a maintenance quote. Prefers SMS follow-ups.'
    },
    {
      id: 'cli_demo_2',
      name: 'Sophia Stanley',
      company: 'Stanley Studio',
      email: 'sophia@example.com',
      phone: '+1 (555) 010-2002',
      address: '88 Market Ave, Austin, TX',
      status: 'lead' as const,
      createdAt: randomDate(45),
      updatedAt: randomDate(10),
      notes: 'Brand kit inquiry. Waiting on budget approval.'
    },
    {
      id: 'cli_demo_3',
      name: 'Jimmy Wilson',
      company: 'Wilson Renovations',
      email: 'jimmy@example.com',
      phone: '+1 (555) 010-2003',
      address: '5 Harbor Rd, San Diego, CA',
      status: 'client' as const,
      createdAt: randomDate(200),
      updatedAt: randomDate(1),
      notes: 'Repeat customer. Quick payer.'
    },
    {
      id: 'cli_demo_4',
      name: 'Maria Chen',
      company: 'Chen Wellness',
      email: 'maria@chenwellness.com',
      phone: '+1 (555) 010-2004',
      address: '22 Sunset Blvd, Los Angeles, CA',
      status: 'client' as const,
      createdAt: randomDate(150),
      updatedAt: randomDate(6),
      notes: 'Ongoing monthly service.'
    },
    {
      id: 'cli_demo_5',
      name: 'Omar Hassan',
      company: 'OH Auto Detailing',
      email: 'omar@ohdetailing.com',
      phone: '+1 (555) 010-2005',
      address: '9 River Dr, Tampa, FL',
      status: 'lead' as const,
      createdAt: randomDate(20),
      updatedAt: randomDate(3),
      notes: 'Asked for 2-vehicle package estimate.'
    },
    {
      id: 'cli_demo_6',
      name: 'Rich Richards',
      company: 'Richards Consulting',
      email: 'rich@example.com',
      phone: '+1 (555) 010-2006',
      address: '101 King St, New York, NY',
      status: 'inactive' as const,
      createdAt: randomDate(380),
      updatedAt: randomDate(120),
      notes: 'Paused services this year.'
    }
  ];

  const demoEstimates = [
    {
      id: 'est_demo_1',
      number: 'EST-0007',
      clientId: 'cli_demo_3',
      client: 'Jimmy Wilson',
      clientCompany: 'Wilson Renovations',
      clientEmail: 'jimmy@example.com',
      clientAddress: '5 Harbor Rd, San Diego, CA',
      amount: 0,
      category: 'Other Service',
      description: 'Bathroom repair + fixture replacement',
      date: randomDate(5),
      validUntil: randomDate(-9),
      status: 'accepted' as const,
      items: [
        { id: generateId('eitem'), description: 'Labor (3 hrs)', quantity: 3, rate: 95 },
        { id: generateId('eitem'), description: 'Fixture & materials', quantity: 1, rate: 180 }
      ],
      subtotal: 465,
      discount: 0,
      taxRate: 8,
      shipping: 0,
      poNumber: 'PO-1027',
      notes: 'Accepted - click Convert to Invoice to see workflow.',
      terms: '50% deposit to schedule work. Balance due on completion.'
    },
    {
      id: 'est_demo_2',
      number: 'EST-0008',
      clientId: 'cli_demo_1',
      client: 'Kenny Barria',
      clientCompany: 'KB Landscaping',
      clientEmail: 'kenny@example.com',
      clientAddress: '12 Palm St, Miami, FL',
      amount: 0,
      category: 'Other Service',
      description: 'Monthly lawn maintenance (4 visits)',
      date: randomDate(2),
      validUntil: randomDate(-12),
      status: 'sent' as const,
      items: [
        { id: generateId('eitem'), description: 'Lawn mow + edge (per visit)', quantity: 4, rate: 85 },
        { id: generateId('eitem'), description: 'Hedge trim (one time)', quantity: 1, rate: 120 }
      ],
      subtotal: 460,
      discount: 20,
      taxRate: 0,
      shipping: 0,
      notes: 'Sent - follow up in 3 days if no response.',
      terms: 'Net 7 days after acceptance.'
    },
    {
      id: 'est_demo_3',
      number: 'EST-0009',
      clientId: 'cli_demo_2',
      client: 'Sophia Stanley',
      clientCompany: 'Stanley Studio',
      clientEmail: 'sophia@example.com',
      clientAddress: '88 Market Ave, Austin, TX',
      amount: 0,
      category: 'Other Service',
      description: 'Brand kit design (logo, colors, typography)',
      date: randomDate(15),
      validUntil: randomDate(-3),
      status: 'draft' as const,
      items: [
        { id: generateId('eitem'), description: 'Discovery call + moodboard', quantity: 1, rate: 250 },
        { id: generateId('eitem'), description: 'Logo concepts (3)', quantity: 1, rate: 900 },
        { id: generateId('eitem'), description: 'Final files + brand guide', quantity: 1, rate: 650 }
      ],
      subtotal: 1800,
      discount: 0,
      taxRate: 0,
      shipping: 0,
      notes: 'Draft - not yet sent.',
      terms: '50% upfront. Remaining due before delivery.'
    },
    {
      id: 'est_demo_4',
      number: 'EST-0010',
      clientId: 'cli_demo_4',
      client: 'Maria Chen',
      clientCompany: 'Chen Wellness',
      clientEmail: 'maria@chenwellness.com',
      clientAddress: '22 Sunset Blvd, Los Angeles, CA',
      amount: 0,
      category: 'Other Service',
      description: 'Monthly bookkeeping + reporting',
      date: randomDate(18),
      validUntil: randomDate(-2),
      status: 'accepted' as const,
      items: [
        { id: generateId('eitem'), description: 'Monthly bookkeeping', quantity: 1, rate: 450 },
        { id: generateId('eitem'), description: 'Quarterly review call', quantity: 1, rate: 150 }
      ],
      subtotal: 600,
      discount: 0,
      taxRate: 0,
      shipping: 0,
      notes: 'Accepted - good example for recurring monthly service.',
      terms: 'Net 15 after invoicing.'
    },
    {
      id: 'est_demo_5',
      number: 'EST-0011',
      clientId: 'cli_demo_6',
      client: 'Rich Richards',
      clientCompany: 'Richards Consulting',
      clientEmail: 'rich@example.com',
      clientAddress: '101 King St, New York, NY',
      amount: 0,
      category: 'Other Service',
      description: 'Quarterly strategy workshop (1 day)',
      date: randomDate(40),
      validUntil: randomDate(20),
      status: 'declined' as const,
      items: [
        { id: generateId('eitem'), description: 'On-site workshop', quantity: 1, rate: 2500 },
        { id: generateId('eitem'), description: 'Follow-up report', quantity: 1, rate: 600 }
      ],
      subtotal: 3100,
      discount: 100,
      taxRate: 0,
      shipping: 0,
      notes: 'Declined - budget shifted.',
      terms: 'Net 14 upon acceptance.'
    },
    {
      id: 'est_demo_6',
      number: 'EST-0012',
      clientId: 'cli_demo_5',
      client: 'Omar Hassan',
      clientCompany: 'OH Auto Detailing',
      clientEmail: 'omar@ohdetailing.com',
      clientAddress: '9 River Dr, Tampa, FL',
      amount: 0,
      category: 'Other Service',
      description: 'Full detail package (2 vehicles)',
      date: randomDate(1),
      validUntil: randomDate(-6),
      status: 'sent' as const,
      items: [
        { id: generateId('eitem'), description: 'Sedan full detail', quantity: 1, rate: 220 },
        { id: generateId('eitem'), description: 'SUV full detail', quantity: 1, rate: 260 }
      ],
      subtotal: 480,
      discount: 0,
      taxRate: 0,
      shipping: 0,
      notes: 'Sent today - shows quick mobile estimate use.',
      terms: 'Pay on completion after acceptance.'
    }
  ].map((e: any) => ({ ...e, amount: computeTotal(e.subtotal || 0, e.discount || 0, e.taxRate || 0, e.shipping || 0) }));

  // Attach demo clientId to many invoices, and add one invoice converted from an estimate
  const clientIdByName = Object.fromEntries(demoClients.map((c: any) => [c.name, c.id]));
  const enhancedInvoices = invoices.map((inv: any) => {
    const cid = clientIdByName[inv.client] || clientIdByName[inv.clientCompany];
    return cid ? { ...inv, clientId: cid } : inv;
  });

  const convertedInvoiceAmount = computeTotal(465, 0, 8, 0);
  enhancedInvoices.unshift({
    id: generateId('inv'),
    number: 'INV-0101',
    clientId: 'cli_demo_3',
    client: 'Jimmy Wilson',
    clientCompany: 'Wilson Renovations',
    clientEmail: 'jimmy@example.com',
    clientAddress: '5 Harbor Rd, San Diego, CA',
    amount: convertedInvoiceAmount,
    category: 'Other Service',
    description: 'Converted from EST-0007',
    date: randomDate(3),
    due: randomDate(-11),
    status: 'unpaid' as const,
    items: [
      { id: generateId('item'), description: 'Labor (3 hrs)', quantity: 3, rate: 95 },
      { id: generateId('item'), description: 'Fixture & materials', quantity: 1, rate: 180 }
    ],
    subtotal: 465,
    discount: 0,
    taxRate: 8,
    shipping: 0,
    notes: 'Example invoice created from an accepted estimate.',
    terms: 'Net 14',
    poNumber: 'PO-1027'
  });

  // Combine and sort transactions
  const allTransactions = [...incomeTransactions, ...expenseTransactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    settings: {
      businessName: "Acme Creative Studio",
      ownerName: "Alex Rivera",
      businessAddress: "123 Innovation Blvd, Tech City, CA 90210",
      businessEmail: "hello@acmecreative.com",
      businessPhone: "(555) 123-4567",
      businessWebsite: "www.acmecreative.com",
      payPrefs: DEFAULT_PAY_PREFS,
      taxRate: 15,
      stateTaxRate: 5,
      taxEstimationMethod: 'custom' as const,
      filingStatus: 'single' as const,
      currencySymbol: "$",
      defaultInvoiceTerms: "Net 15. Please make checks payable to Acme Creative Studio.",
      defaultInvoiceNotes: "Thank you for your business!"
    },
    transactions: allTransactions,
    clients: demoClients,
    estimates: demoEstimates,
    invoices: enhancedInvoices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    taxPayments: taxPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  };
};
