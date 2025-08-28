import fs from 'fs';
import path from 'path';
import swaggerJSDoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Fluentd-ws-gateway service API',
      version: '1.0.0',
      description: 'API of Fluentd-ws-gateway service',
    },
    servers: [
      { url: 'http://localhost:300' },
    ],
  },
  apis: ['./src/*.ts'], // путь к файлам с JSDoc
};

const swaggerSpec = swaggerJSDoc(options);

const outputPath = path.resolve(__dirname, 'openapi.json');

fs.writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2));

console.log(`API spec generated`);
