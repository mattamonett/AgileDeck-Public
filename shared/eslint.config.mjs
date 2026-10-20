import tseslint from 'typescript-eslint';
import { ignores, typescript } from '../eslint.config.base.mjs';

export default tseslint.config(ignores, ...typescript);
