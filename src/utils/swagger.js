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

const baseSpec = swaggerJsdoc(options);

// Returns a fresh spec on every call with today's date injected into upload examples.
// This way the start_time/end_time defaults shown in Swagger UI always reflect "today".
export const getSwaggerSpec = () => {
  const spec = JSON.parse(JSON.stringify(baseSpec));
  const today = new Date().toISOString().slice(0, 10);
  const props =
    spec?.paths?.["/content/upload"]?.post?.requestBody?.content?.[
      "multipart/form-data"
    ]?.schema?.properties;
  if (props?.start_time) props.start_time.example = `${today}T00:00:00`;
  if (props?.end_time) props.end_time.example = `${today}T23:59:00`;
  return spec;
};

export const swaggerSpec = getSwaggerSpec();
