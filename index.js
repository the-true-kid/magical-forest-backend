const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors({ origin: 'http://localhost:3000' }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let gameState = {
  character: '',
  currentChoice: 1,
  scenario: '',
  progress: [],
  successCount: 0,
};

const MAX_CHOICES = 6;
const adventures = [
  'Turn a princess back from a frog.',
  'Find the key to the dragon’s treasure room.',
  'Defeat the evil wizard at the forest’s exit.',
];

// Route to start the adventure
app.post('/start', async (req, res) => {
  const { character } = req.body;

  if (!character) {
    return res.status(400).json({ error: 'Character is required to start the game.' });
  }

  gameState = {
    character,
    currentChoice: 1,
    scenario: adventures[Math.floor(Math.random() * adventures.length)],
    progress: [],
    successCount: 0,
  };

  const prompt = `
    Welcome to a choose-your-own-adventure game! You are a ${gameState.character} on a quest: ${gameState.scenario}.
    The adventure will be made up of exactly 6 decisions. The fourth decision will introduce the main challenge or climax, 
    and the sixth decision will determine whether the adventure ends successfully or not.

    Each scene will unfold in exactly two sentences:
    - The first sentence sets the scene.
    - The second sentence presents the player's next action options.

    Keep the story focused on the original quest: "${gameState.scenario}".

    Please respond ONLY in the following JSON format (no additional text or explanations):
    {
      "scene": "The description of the scene in two sentences.",
      "options": {
        "A": "First action option.",
        "B": "Second action option."
      }
    }
  `;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.7,
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );

    const content = response.data.choices[0].message.content.trim();
    let parsedResponse;

    try {
      // Attempt to parse JSON content
      const sanitizedContent = content.replace(/^[^{]*|[^}]*$/g, '');
      parsedResponse = JSON.parse(sanitizedContent);
    } catch (parseError) {
      console.warn('Failed to parse JSON. Falling back to manual extraction.');

      const lines = content.split('\n').map(line => line.trim()).filter(line => line);
      const scene = lines[0];
      const optionA = lines[1]?.replace(/^A:\s*/, '') || 'Option A not found.';
      const optionB = lines[2]?.replace(/^B:\s*/, '') || 'Option B not found.';

      parsedResponse = { scene, options: { A: optionA, B: optionB } };
    }

    const { scene, options } = parsedResponse;

    if (!options.A || !options.B) {
      throw new Error('Missing options A or B in the response.');
    }

    gameState.progress.push({ choice: 'start', result: scene });

    res.json({
      message: `You are a ${character}. Your adventure: ${gameState.scenario}`,
      scene,
      optionA: options.A,
      optionB: options.B,
    });
  } catch (error) {
    console.error('Error generating first scene:', error);
    res.status(500).send('Error starting adventure. Please try again.');
  }
});

// Route to handle each adventure choice
app.post('/adventure', async (req, res) => {
  const { choice } = req.body;

  if (!gameState.character || !gameState.scenario) {
    return res.status(400).json({ error: 'Game not initialized. Please start a new game.' });
  }

  if (choice !== 'A' && choice !== 'B') {
    return res.status(400).json({ error: 'Invalid choice. Please choose A or B.' });
  }

  const context = gameState.progress.map(step => step.result).join('\n');

  const prompt = `
    Continue the choose-your-own-adventure story based on the previous scenes:
    ${context}
    This is decision #${gameState.currentChoice}. The player chose: ${choice}.

    Remember:
    - Keep the story focused on the original quest: "${gameState.scenario}".
    - The story should build towards a climax by decision 4.
    - The sixth and final decision will determine whether the quest ends successfully or not.

    Please respond ONLY in the following JSON format (no additional text or explanations):
    {
      "scene": "The description of the scene in two sentences.",
      "options": {
        "A": "First action option.",
        "B": "Second action option."
      }
    }
  `;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.7,
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );

    const content = response.data.choices[0].message.content.trim();
    let parsedResponse;

    try {
      const sanitizedContent = content.replace(/^[^{]*|[^}]*$/g, '');
      parsedResponse = JSON.parse(sanitizedContent);
    } catch (parseError) {
      console.warn('Failed to parse JSON. Falling back to manual extraction.');

      const lines = content.split('\n').map(line => line.trim()).filter(line => line);
      const scene = lines[0];
      const optionA = lines[1]?.replace(/^A:\s*/, '') || 'Option A not found.';
      const optionB = lines[2]?.replace(/^B:\s*/, '') || 'Option B not found.';

      parsedResponse = { scene, options: { A: optionA, B: optionB } };
    }

    const { scene, options } = parsedResponse;

    if (!options.A || !options.B) {
      throw new Error('Missing options A or B in the response.');
    }

    gameState.progress.push({ choice, result: scene });
    gameState.currentChoice++;

    if (gameState.currentChoice >= MAX_CHOICES) {
      const outcome = gameState.successCount >= 4 ? 'win' : 'lose';
      const finalMessage = outcome === 'win'
        ? 'Congratulations! You completed your quest.'
        : 'Your quest ends in failure, but every adventure teaches a lesson.';

      return res.json({ scene, finalMessage });
    }

    res.json({
      scene,
      optionA: options.A,
      optionB: options.B,
    });
  } catch (error) {
    console.error('Error processing your choice:', error);
    res.status(500).send('Error processing your choice.');
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
