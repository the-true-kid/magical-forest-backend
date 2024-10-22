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

// Helper to limit sentences to 2-3
const limitSentences = (text) => {
  const sentences = text.split('. ').slice(0, 3);
  return sentences.join('. ').trim() + '.';
};

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
    Describe the opening scene in 2-3 sentences. Provide two distinct options: A and B.
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
    const [scene, optionA, optionB] = content.split('\n').map((line) => line.trim());

    gameState.progress.push({ choice: 'start', result: scene });

    res.json({
      message: `You are a ${character}. Your adventure: ${gameState.scenario}`,
      scene: limitSentences(scene),
      optionA,
      optionB,
    });
  } catch (error) {
    console.error('Error generating first scene:', error);
    res.status(500).send('Error starting adventure.');
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

  const context = gameState.progress.map((step) => step.result).join('\n');

  const prompt = `
    Continue the story based on the previous scenes:
    ${context}
    This is choice #${gameState.currentChoice}. The player chose: ${choice}.
    Write the next part in 2-3 sentences. Provide two new options: A and B, unless this is the final scene.
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
    const [scene, optionA, optionB] = content.split('\n').map((line) => line.trim());

    gameState.progress.push({ choice, result: scene });

    gameState.currentChoice++;

    if (gameState.currentChoice >= MAX_CHOICES) {
      const outcome = gameState.successCount >= 4 ? 'win' : 'lose';
      const finalMessage = outcome === 'win'
        ? 'Congratulations! You completed your quest.'
        : 'Your quest ends in failure, but every adventure teaches a lesson.';

      return res.json({ scene: limitSentences(scene), finalMessage });
    }

    res.json({
      scene: limitSentences(scene),
      optionA,
      optionB,
    });
  } catch (error) {
    console.error('Error generating next scene:', error);
    res.status(500).send('Error processing your choice.');
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
