import fs from 'fs';
import path from 'path';
import swaggerJSDoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'test Swagger specs',
      version: '1.0.0',
      description: 'API of test-openapi-specs service',
    },
    servers: [
      { url: 'http://localhost:3000' },
    ],
  },
  apis: ['./src/*.ts'],
};

const swaggerSpec = swaggerJSDoc(options);

const outputPath = path.resolve(__dirname, 'openapi.json');

fs.writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2));

console.log(`API spec generated`);
