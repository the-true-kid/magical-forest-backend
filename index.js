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

const adventures = [
  'Turn a princess back from a frog',
  'Find the key to the dragon’s treasure room',
  'Get past the evil wizard at the forest’s exit',
];

// Helper function to build the context from progress
const buildContext = () => gameState.progress.map((step) => step.result).join('\n');

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
    You are a ${gameState.character} on a quest: ${gameState.scenario}.
    Write the opening scene in two sentences and offer two choices (A or B).
    Indicate if the outcome is likely to succeed or fail.
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

    const firstScene = response.data.choices[0].message.content.trim();
    gameState.progress.push({ choice: 'start', result: firstScene });

    res.json({ message: `You are a ${character}. Your adventure: ${gameState.scenario}`, firstScene });
  } catch (error) {
    console.error('Error generating first scene:', error);
    res.status(500).send('Error starting adventure.');
  }
});

// Route to handle each choice
app.post('/adventure', async (req, res) => {
  const { choice } = req.body;

  if (!gameState.character || !gameState.scenario) {
    return res.status(400).json({ error: 'Game not initialized. Please start a new game.' });
  }

  if (choice !== 'A' && choice !== 'B') {
    return res.status(400).json({ error: 'Invalid choice. Please choose A or B.' });
  }

  const context = buildContext();

  const prompt = `
    Continue the story based on the previous scenes:
    ${context}
    This is choice #${gameState.currentChoice}. The player chose: ${choice}.
    Write the next scene in two sentences and indicate if the outcome is successful or not.
    Provide two new choices (A or B), unless this is the final outcome.
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

    const newScene = response.data.choices[0].message.content.trim();
    gameState.progress.push({ choice, result: newScene });

    const successKeywords = ['success', 'gratitude', 'relief', 'victory', 'completed'];
    const isSuccess = successKeywords.some((word) => newScene.toLowerCase().includes(word));

    if (isSuccess) {
      gameState.successCount++;
    }

    if (gameState.currentChoice >= 6) {
      const outcome = gameState.successCount >= 4 ? 'win' : 'lose';
      const finalMessage = outcome === 'win'
        ? 'Congratulations! You successfully completed your quest.'
        : 'You failed in your mission, but every adventure teaches a lesson.';
      return res.json({ scene: newScene, finalMessage });
    }

    gameState.currentChoice++;
    res.json({ scene: newScene });
  } catch (error) {
    console.error('Error generating next scene:', error);
    res.status(500).send('Error processing your choice.');
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
