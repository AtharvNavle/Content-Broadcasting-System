import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Content Broadcasting System API",
      version: "1.0.0",
      description: "Backend API for the Content Broadcasting System assignment",
    },
    servers: [
      {
        url: "/",
        description: "Current host (works for both local and deployed)",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [],
  },
  apis: ["./src/routes/*.js"],
};

export const swaggerSpec = swaggerJsdoc(options);
