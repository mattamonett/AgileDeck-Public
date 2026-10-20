import * as THREE from 'three';
import { makeDog } from '../dog/dog-model';
import { makeCat } from '../cat/cat-model';

export function makePet(dog: boolean): THREE.Group {
  return dog ? makeDog() : makeCat();
}
