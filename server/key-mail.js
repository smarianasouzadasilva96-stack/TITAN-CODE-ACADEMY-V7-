import { connect } from 'node:tls';

// SMTP seguro via TLS implícito (porta 465). Nenhuma dependência adicional.
export async function sendMail(email,code){
 const {SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASSWORD,SMTP_FROM}=process.env;
 if(!SMTP_HOST||!SMTP_USER||!SMTP_PASSWORD||!SMTP_FROM)throw Error('Configure SMTP_HOST, SMTP_USER, SMTP_PASSWORD e SMTP_FROM');
 if(Number(SMTP_PORT||465)!==465)throw Error('Este transporte SMTP requer TLS na porta 465');
 if(!/^[^\r\n<>]+@[^\r\n<>]+$/.test(SMTP_FROM))throw Error('SMTP_FROM inválido');
 const socket=connect({host:SMTP_HOST,port:465,servername:SMTP_HOST,rejectUnauthorized:true});
 socket.setTimeout(15000);
 let buffer='', lines=[], pending=null, error=null;
 socket.on('data',chunk=>{buffer+=chunk.toString('utf8');let idx;while((idx=buffer.indexOf('\r\n'))!==-1){const line=buffer.slice(0,idx);buffer=buffer.slice(idx+2);lines.push(line);if(/^\d{3} /.test(line)&&pending){const done=pending;pending=null;const result=lines;lines=[];done.resolve(result)}}});
 socket.on('error',err=>{error=err;if(pending){pending.reject(err);pending=null}});
 socket.on('timeout',()=>socket.destroy(Error('Tempo limite do SMTP')));
 const reply=()=>new Promise((resolve,reject)=>{if(error)return reject(error);pending={resolve,reject}});
 const command=async(value,expected)=>{const waiting=reply();socket.write(value+'\r\n');const result=await waiting;const status=Number(result.at(-1).slice(0,3));if(!expected.includes(status))throw Error('SMTP retornou '+status);return result};
 try{
  await new Promise((resolve,reject)=>{socket.once('secureConnect',resolve);socket.once('error',reject)});
  // Saudação pode ter chegado antes do handshake terminar; espera a resposta final.
  if(!lines.some(line=>/^220 /.test(line))){const greeting=await reply();if(!greeting.at(-1).startsWith('220 '))throw Error('SMTP indisponível')}else lines=[];
  await command('EHLO titan.local',[250]);
  await command('AUTH LOGIN',[334]);
  await command(Buffer.from(SMTP_USER).toString('base64'),[334]);
  await command(Buffer.from(SMTP_PASSWORD).toString('base64'),[235]);
  await command(`MAIL FROM:<${SMTP_FROM}>`,[250]);
  await command(`RCPT TO:<${email}>`,[250,251]);
  await command('DATA',[354]);
  const subject='=?UTF-8?B?'+Buffer.from('Seu código de acesso • TITAN CODE ACADEMY').toString('base64')+'?=';
  const html=`<!doctype html><html lang="pt-BR"><body style="margin:0;padding:30px;background:#100b10;font-family:Arial,sans-serif;color:#fff"><table role="presentation" style="max-width:560px;margin:auto;background:#211420;border:1px solid #75314c;border-radius:18px;padding:28px;width:100%"><tr><td><h1 style="color:#ff5c82">TITAN CODE ACADEMY</h1><h2>Confirme seu e-mail</h2><p>Use este código para acessar sua Central de Chaves:</p><p style="font-size:38px;letter-spacing:7px;font-weight:bold;text-align:center;background:#382031;border-radius:12px;padding:20px">${code}</p><p>Válido por 15 minutos e uma única utilização.</p><p style="color:#d7b9c4;font-size:13px">Não solicitou este código? Ignore esta mensagem. Nunca compartilhe seu acesso.</p></td></tr></table></body></html>`;
  const payload=[`From: ${SMTP_FROM}`,`To: ${email}`,`Subject: ${subject}`,'MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',''+Buffer.from(html).toString('base64').replace(/.{1,76}/g,'$&\r\n').trim(),''].join('\r\n');
  await command(payload+'\r\n.',[250]);
  socket.write('QUIT\r\n');
 }finally{socket.end();socket.destroy()}
}
