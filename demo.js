'use strict';
const exercise=document.getElementById('exercise');
const cards=[
 {type:'word',q:'Как звали собаку Герасима?',a:'МУМУ',clues:['Вспомни, кого Герасим спас из воды. Как он звал свою собаку?','Герасим не мог говорить. Подумай, какое короткое имя он мог произнести.']},
 {type:'image',q:'Почему Герасим так привязался к Муму?',a:'Герасим чувствовал себя одиноким. Он спас и выходил Муму, заботился о ней, а она отвечала ему любовью и преданностью. Она стала ему близким существом.',keys:['одинок','одиноч','забот','ухаж','спас','люб','предан','друж','друг','близк'],hints:[['mumu-alone.png','Вспомни его жизнь до встречи с Муму. Чего ему не хватало?','Герасим сидит один во дворе'],['mumu-care.png','Как Герасим заботился о спасённой Муму?','Герасим кормит собаку'],['mumu-friend.png','Как Муму относилась к Герасиму? Почему это было ему дорого?','Муму прижимается к Герасиму']]},
 {type:'image',q:'Какие поступки Герасима говорят о его заботе о Муму?',a:'Герасим спас Муму, выходил её, кормил и оберегал. Его забота проявлялась в конкретных поступках.',keys:['спас','корм','выход','оберег','ухаж','выхаж','защищ','поил'],hints:[['mumu-care.png','Что он делает, чтобы собака не осталась голодной?','Герасим даёт Муму еду'],['mumu-friend.png','Как он обращается с ней?','Герасим гладит Муму']]}];
let index=0,hints=0,phase='answer';
const norm=s=>s.toLowerCase().replaceAll('ё','е').trim();
function el(tag,text,cls){const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;}
function button(text,action,cls='secondary'){const b=el('button',text,cls);b.type='button';b.addEventListener('click',action);return b;}
function render(){
 exercise.onkeydown=null;exercise.replaceChildren();
 if(index===cards.length){exercise.append(el('span','Пример завершён','eyebrow'),el('h3','Вы попробовали два способа вспоминать'),el('p','Выбор букв помогает вспомнить имя, а сцены и вопросы — объяснить поступок. В приложении можно выбрать тему и вернуться к трудным карточкам.'),button('Пройти ещё раз',()=>{index=0;hints=0;phase='answer';render()},'primary'));return;}
 const c=cards[index];const top=el('div',null,'demo-top');top.append(el('span',`Карточка ${index+1} из ${cards.length}`),el('span',c.type==='word'?'Карточка-слово':'Карточка-образ'));exercise.append(top,el('h3',c.q));
 if(c.type==='word'){renderWord(c);return;}
 const hintArea=el('div');exercise.append(hintArea);
 function showHints(){hintArea.replaceChildren();if(c.type==='word'){const row=el('div',null,'slots');[...c.a].forEach((l,i)=>row.append(el('span',c.order.slice(0,hints).includes(i)?l:'_',c.order.slice(0,hints).includes(i)?'slot reveal':'slot')));row.setAttribute('aria-label','Подсказка: '+[...c.a].map((l,i)=>c.order.slice(0,hints).includes(i)?l:'пропуск').join(', '));hintArea.append(row);}else{c.hints.slice(0,hints).forEach(([file,clue,alt])=>{const f=el('figure',null,'hint'),img=document.createElement('img');img.src='assets/'+file;img.alt=alt;img.width=1536;img.height=1024;f.append(img,el('figcaption',clue));hintArea.append(f);});}}
 showHints();const form=document.createElement('form'),label=el('label',c.type==='word'?'Твой ответ':'Твой ответ своими словами');label.htmlFor='demo-answer';const input=document.createElement(c.type==='word'?'input':'textarea');input.id='demo-answer';input.autocomplete='off';input.maxLength=600;input.setAttribute('aria-describedby','demo-feedback');form.append(label,input);const actions=el('div',null,'actions'),check=el('button','Проверить','primary');check.type='submit';actions.append(check);const hintButton=button('Подсказка словами',()=>reveal(false));actions.append(hintButton);form.append(actions);exercise.append(form);const feedback=el('p',null,'feedback');feedback.id='demo-feedback';feedback.setAttribute('aria-live','polite');exercise.append(feedback);
 function complete(known){phase='done';form.remove();const a=el('div',null,'answer');a.append(el('strong',known?'Сравни с объяснением':'Вспомним вместе'),el('p',c.a));exercise.append(a,button(index===cards.length-1?'Завершить пример':'Следующая карточка',()=>{index++;hints=0;phase='answer';render();exercise.querySelector('h3').setAttribute('tabindex','-1');exercise.querySelector('h3').focus()},'primary'));feedback.textContent=known?'Верно!':'Показ ответа не считается самостоятельным ответом.';feedback.className=known?'feedback success':'feedback';}
 function reveal(error){const max=c.type==='word'?c.a.length:c.hints.length;if(hints<max){hints++;showHints();feedback.textContent=error?'Пока не получилось. Посмотри на подсказку.':'Вот подсказка. Попробуй вспомнить.';if(hints===max)hintButton.textContent='Показать объяснение';}else complete(false);}
 form.addEventListener('submit',event=>{event.preventDefault();if(!norm(input.value)){feedback.textContent='Напиши ответ или открой подсказку.';input.focus();return;}if(phase==='expand'){complete(true);return;}const words=norm(input.value).match(/[а-я]+/g)||[];const ok=c.type==='word'?norm(input.value)===norm(c.a):words.some(w=>c.keys.some(k=>w.startsWith(k)));if(!ok){reveal(true);return;}if(c.type==='word'){complete(true);return;}phase='expand';feedback.className='feedback success';feedback.textContent='Есть верная мысль! Можно дополнить ответ, а затем сравнить с объяснением.';check.textContent='Сравнить с объяснением';hintButton.remove();input.focus();});
}
function renderWord(c){
 const selected=new Set(), row=el('div',null,'slots'),clues=el('div'),keys=el('div',null,'letter-keys'),actions=el('div',null,'actions'),feedback=el('p',null,'feedback');
 let shown=0,done=false;
 feedback.setAttribute('aria-live','polite');row.setAttribute('aria-label','Ответ');
 const keyOf=s=>s.toUpperCase().replaceAll('Ё','Е');
 const letters=[...c.a], answer=new Set(letters.filter(x=>!/[\s–—-]/u.test(x)).map(keyOf));
 function slots(full=false){row.replaceChildren();letters.forEach(l=>{const gap=/[\s–—-]/u.test(l),visible=full||selected.has(keyOf(l));row.append(el('span',gap?l:visible?l:'_',gap?'slot gap':visible?'slot reveal':'slot'));});}
 function finish(known){done=true;slots(true);keys.remove();actions.replaceChildren();feedback.textContent=known?'Верно! Ответ собран.':'Ответ открыт. Попробуй вспомнить его самостоятельно в следующий раз.';feedback.className=known?'feedback success':'feedback';exercise.append(el('p',c.a,'answer'));actions.append(button('Следующая карточка',()=>{index++;hints=0;phase='answer';render();const heading=exercise.querySelector('h3');heading.tabIndex=-1;heading.focus()},'primary'));}
 const buttons=new Map();
 function pick(ch){ch=keyOf(ch);if(done||selected.has(ch)||!buttons.has(ch))return;selected.add(ch);const hit=answer.has(ch),b=buttons.get(ch);b.disabled=true;b.classList.add(hit?'hit':'miss');b.setAttribute('aria-label',ch+(hit?', есть в ответе':', нет в ответе'));slots();feedback.textContent=hit?'«'+ch+'» есть в ответе.':'«'+ch+'» нет в ответе. Попробуй другую.';if([...answer].every(l=>selected.has(l)))finish(true);}
 for(const ch of 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ0123456789'){const b=button(ch,()=>pick(ch),'letter-key');buttons.set(ch,b);keys.append(b);}
 const hint=button('Подсказка словами',()=>{clues.append(el('p',c.clues[shown++],'word-clue'));if(shown===c.clues.length)hint.disabled=true;});
 actions.append(hint,button('Показать ответ',()=>finish(false)));
 exercise.append(row,el('p','Нажимай буквы: сразу увидишь, есть ли они в ответе. Одинаковые буквы открываются вместе.'),clues,keys,feedback,actions);
 exercise.onkeydown=e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.key.length!==1)return;if(buttons.has(keyOf(e.key))){e.preventDefault();pick(e.key);}};
 slots();
}
render();
