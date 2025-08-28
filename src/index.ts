import express, { Request, Response } from "express";

const app = express();
app.use(express.json());

/**
 * @openapi
 * /hello:
 *   get:
 *     summary: Returns a simple hello message
 *     responses:
 *       200:
 *         description: A hello message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Hello, world!
 */
app.get("/hello", (req: Request, res: Response) => {
  res.json({ message: "Hello, world!" });
});

/**
 * @openapi
 * /user/{id}:
 *   get:
 *     summary: Get user by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A user object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: "123"
 *                 name:
 *                   type: string
 *                   example: "John Doe"
 */
app.get("/user/:id", (req: Request, res: Response) => {
  res.json({ id: req.params.id, name: "John Doe" });
});

/**
 * @openapi
 * /user:
 *   post:
 *     summary: Create a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Jane Doe
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: "456"
 *                 name:
 *                   type: string
 *                   example: "Jane Doe"
 */
app.post("/user", (req: Request, res: Response) => {
  const { name } = req.body as { name: string };
  res.status(201).json({ id: "456", name });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
