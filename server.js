const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const { body, validationResult } = require('express-validator');

dotenv.config();

const app = express();
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  stock: Number,
});

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  role: String, // 'admin' or 'user'
});

const cartSchema = new mongoose.Schema({
  userId: String,
  productId: mongoose.Schema.Types.ObjectId,
  quantity: Number,
});

const Product = mongoose.model('Product', productSchema);
const User = mongoose.model('User', userSchema);
const Cart = mongoose.model('Cart', cartSchema);

// Dummy users and products for seeding
const users = [
  { username: 'admin', password: 'admin123', role: 'admin' },
  { username: 'user', password: 'user123', role: 'user' },
];

const dummyProducts = [
  { name: 'Product A', price: 10, stock: 100 },
  { name: 'Product B', price: 20, stock: 50 },
];

// Seed DB on connection open
mongoose.connection.once('open', async () => {
  console.log('Connected to MongoDB');

  // Seed users
  for (const user of users) {
    const existingUser = await User.findOne({ username: user.username });
    if (!existingUser) {
      await new User(user).save();
      console.log(`User '${user.username}' added to DB.`);
    }
  }

  // Seed products
  for (const product of dummyProducts) {
    const existingProduct = await Product.findOne({ name: product.name });
    if (!existingProduct) {
      await new Product(product).save();
      console.log(`Product '${product.name}' added to DB.`);
    }
  }
});

// Routes

// Login (now checking users in DB instead of array)
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const foundUser = await User.findOne({ username, password });
  if (foundUser) {
    return res.json({ role: foundUser.role });
  } else {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Get Products
app.get('/product', async (req, res) => {
  const products = await Product.find();
  res.json(products);
});

// Create Product
app.post('/products',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('price').isNumeric().withMessage('Price must be a number'),
    body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const newProduct = new Product(req.body);
    await newProduct.save();
    res.json({ message: 'Product created', product: newProduct });
  }
);

// Update Product
app.put('/products/:id',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('price').isNumeric().withMessage('Price must be a number'),
    body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const updated = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product updated', product: updated });
  }
);

// Delete Product
app.delete('/products/:id', async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ message: 'Product deleted' });
});

// Add to Cart
app.post('/cart',
  [
    body('userId').notEmpty().withMessage('User ID required'),
    body('productId').notEmpty().withMessage('Product ID required'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  ],
  async (req, res) => {
    const { userId, productId, quantity } = req.body;
    const product = await Product.findById(productId);
    if (!product || product.stock < quantity) {
      return res.status(400).json({ error: 'Insufficient stock or product not found' });
    }

    const cartItem = new Cart({ userId, productId, quantity });
    await cartItem.save();
    res.json({ message: 'Added to cart' });
  }
);

// Purchase Cart
app.post('/cart/purchase', async (req, res) => {
  const { userId } = req.body;
  const items = await Cart.find({ userId });

  for (let item of items) {
    const product = await Product.findById(item.productId);
    if (product && product.stock >= item.quantity) {
      product.stock -= item.quantity;
      await product.save();
    } else {
      return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
    }
  }

  await Cart.deleteMany({ userId });
  res.json('Purchase successful!');
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
