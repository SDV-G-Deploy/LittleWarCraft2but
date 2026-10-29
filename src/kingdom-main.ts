import { runKingdom2000 } from './revival/kingdom2000';
import './revival/kingdom2000.css';

const root = document.getElementById('app');

if (!root) throw new Error('App root not found');

runKingdom2000(root);
