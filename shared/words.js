// How the game talks about players. A seat named "You" is the person holding this phone.
export const isYou = p => /^you$/i.test(String(p.name).trim());
export const subj = p => isYou(p) ? 'you' : p.name;
export const vs = (p, v) => isYou(p) ? v : v + 's';
export const poss = p => isYou(p) ? 'your' : p.name + '’s';
export function namesList(names){
  return names.length <= 2 ? names.join(' and ') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}
