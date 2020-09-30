import { Server } from './Server';
require('source-map-support').install();
const port = parseInt(process.env.MERGE_TRAIN_PORT, 10) || 56874;
const server = new Server(port).start();
