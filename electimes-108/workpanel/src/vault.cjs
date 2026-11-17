const fs=require('node:fs/promises'),path=require('node:path');
class Vault {
  constructor(dir, safeStorage, platform=process.platform) { this.dir=dir;this.crypto=safeStorage;this.platform=platform; }
  async available() { return (this.crypto.isAsyncEncryptionAvailable ? await this.crypto.isAsyncEncryptionAvailable() : this.crypto.isEncryptionAvailable()) && !(this.platform==='linux' && this.crypto.getSelectedStorageBackend?.()==='basic_text'); }
  async read(name) {
    if (!await this.available()) return null;
    try {
      const b=await fs.readFile(path.join(this.dir,name+'.sealed'));
      const decrypted=this.crypto.decryptStringAsync ? await this.crypto.decryptStringAsync(b) : this.crypto.decryptString(b);
      const text=typeof decrypted==='string'?decrypted:decrypted?.result;
      if(typeof text!=='string')throw Error('invalid-decryption-result');
      return JSON.parse(text);
    } catch(e) { if (e.code==='ENOENT') return null; throw Error('secure-storage-read'); }
  }
  async write(name,data) {
    if (!await this.available()) throw Error('secure-storage-unavailable');
    await fs.mkdir(this.dir,{recursive:true,mode:0o700});
    const bytes=this.crypto.encryptStringAsync ? await this.crypto.encryptStringAsync(JSON.stringify(data)) : this.crypto.encryptString(JSON.stringify(data));
    const file=path.join(this.dir,name+'.sealed'); await fs.writeFile(file+'.tmp',bytes,{mode:0o600});await fs.rename(file+'.tmp',file);
  }
  async remove(name) { await fs.rm(path.join(this.dir,name+'.sealed'),{force:true}); }
}
module.exports={Vault};
