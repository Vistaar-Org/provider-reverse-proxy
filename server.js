const express = require('express');
const axios = require('axios');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Read the configuration file
let config;
try {
  config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  console.log('Loaded configuration:', config);
} catch (error) {
  console.error('Error loading configuration:', error);
  process.exit(1);
}

// Route to display the current configuration (for development only)
if (process.env.NODE_ENV !== 'production') {
  app.get('/', (req, res) => {
    res.json(config);
  });
}

// Create a middleware for each target in the configuration
config.targets.forEach(target => {
  console.log(`Setting up middleware for ${target.path} to ${target.url}`);
  app.use(`/${target.path}`, async (req, res) => {
    const newPath = req.url.replace(new RegExp(`^/${target.path}`), '/');
    const fullUrl = `${target.url}${newPath}`;

    console.log(`Sending request to: ${fullUrl}`);

    try {
      const axiosConfig = {
        method: req.method,
        url: fullUrl,
        headers: {
          ...req.headers,
          ...target.headers,
          host: new URL(target.url).host,  // Set the correct host header
        },
        data: req.body,
        responseType: 'arraybuffer',  // To handle all types of responses
      };

      // Remove headers that might reveal the original client
      delete axiosConfig.headers['x-forwarded-for'];
      delete axiosConfig.headers['x-real-ip'];
      delete axiosConfig.headers['forwarded'];

      const response = await axios(axiosConfig);

      // Set the status code
      res.status(response.status);

      // Set the headers
      Object.entries(response.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      // Send the response body
      res.send(response.data);

    } catch (error) {
      console.error(`Error for ${req.url}:`, error);
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        res.status(error.response.status).send(error.response.data);
      } else if (error.request) {
        // The request was made but no response was received
        res.status(504).json({ error: 'Gateway Timeout', message: 'No response received from the target server' });
      } else {
        // Something happened in setting up the request that triggered an Error
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
      }
    }
  });
});

// Catch-all route for unhandled requests
app.use((req, res) => {
  console.log(`Unhandled request: ${req.method} ${req.url}`);
  res.status(404).json({ message: `The path ${req.url} is not handled.` });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});