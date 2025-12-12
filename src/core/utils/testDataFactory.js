const TEST_DATA_TEMPLATES = {
  'text-embedding': [
    'trail running shoes lightweight breathable mesh upper',
    'waterproof hiking boots winter insulated ankle support',
    'camping tent 4 person family double wall weatherproof',
    'down sleeping bag 20 degree rating compact compression',
    'backpack 65L internal frame adjustable torso length',
    'water filter portable pump ceramic element',
    'camping stove propane canister wind screen',
    'headlamp LED rechargeable adjustable brightness',
  ],

  'classification': [
    'This product is way too expensive for what you get.',
    'Great value for the money! Would definitely buy again.',
    'Quality is okay but not worth the premium price.',
    'Best purchase I\'ve made this year, highly recommended!',
    'Overpriced considering the alternatives available.',
  ],

  'image-tagging': [
    { prompt: 'Describe this outdoor product', image: '/test/placeholder.jpg' },
    { prompt: 'What activity is this gear for?', image: '/test/placeholder2.jpg' },
  ]
};

export function generateTestData(taskType, count = 5) {
  const templates = TEST_DATA_TEMPLATES[taskType];
  if (!templates) {
    throw new Error(`Unknown task type: ${taskType}. Available: ${Object.keys(TEST_DATA_TEMPLATES).join(', ')}`);
  }

  return Array.from({ length: count }, (_, i) => {
    const template = templates[i % templates.length];
    return typeof template === 'string'
      ? { texts: [template] }
      : { ...template };
  });
}
