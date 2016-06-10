var querystring = require('querystring');
var request = require('request');
var zlib = require('zlib');
var env = require('node-env-file');
var fs = require('fs');
var readline = require('readline');

var title = "";
var user_login_cookie;
var loan;
var page_num = -1;
var saved_page = 0;
var tenths = 1; //for chunking requests

env(__dirname + '/.env');

var loginPostData = querystring.stringify({
    username: process.env.USERNAME,
    password: process.env.PASSWORD,
    redirect: "https://openlibrary.org/",
    login: "Log In"
});
//log in
login();
function login(){
  request({
      headers:{
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': loginPostData.length,
          "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Encoding":"gzip, deflate",
      },
      uri:"https://openlibrary.org/account/login",
      body:loginPostData,
      method:'POST'
  },
  function(err,res,body){
      user_login_cookie = res.headers['set-cookie'][0].split(' ')[0].slice(0,-1);
      //get loans
      get_loans();
      //user logged in now
  });
}
//go to page where loans are
function get_loans(){
  request({
      headers:{
        "Cookie":user_login_cookie
      },
      method:'GET',
      url: "https://openlibrary.org/account/loans"
  },
  function(err,res,body){
    body = body.replace(/[\r\n]/g," ");
    var books = body.match(/class=\"book\"(.*?)\/strong/g);
    var loans = [];
    var titles = [];
    for(var book in books){
      loans.push(books[book].match(/href="(.*?)"/)[1]);
      titles.push(books[book].match(/<strong>(.*?)<\/strong/)[1].replace('&quot;','\\"'));
    }
    // get_cookies(user_login_cookie,loan);
    for(var i=1;i<=titles.length;i++){
      console.log(i+" "+titles[i-1]);
    }
    choose_book(titles.length,loans,titles);

  });
}

 function choose_book(max,loans,titles){
  console.log(loans);
  console.log(max);
  const rl = readline.createInterface({
      input: process.stdin,
      output:process.stdout
    });
    //user chooses book
    rl.question('Choose loan to scan ', (answer)=>{
      if(parseInt(answer)<=max){
        var choice = parseInt(answer)-1;
        title = titles[choice];
        loan = loans[choice];
        get_cookies(loan);
        rl.close();
      }
      else{
        console.log('Invalid input');
        choose_book(max,loans,titles);
      }
    });
 } 

//cookies needed to view content
function get_cookies(loan){
    user_login_cookie = user_login_cookie;
    var borrowPostData = querystring.stringify({
        action:"read",
        ol_host:"openlibrary.org"
    });
    console.log("https://openlibrary.org"+loan+"/_doread/borrow");
    request({
        headers:{
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': borrowPostData.length,
            "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Encoding":"gzip, deflate",
            "Cookie":user_login_cookie,
            "Host":"openlibrary.org",
            "Origin":"https://openlibrary.org",
            "Referer":"https://openlibrary.org/account/loans",
            "Upgrade-Insecure-Requests":1
        },
        uri:"https://openlibrary.org"+loan+"/_doread/borrow",//path is gotten as action on READ ONLINE button on loan page
        body: borrowPostData,
        method:'POST'
    },
    function(err,res,body){
        console.log('got location ' + res.headers.location);
        get_server(res.headers.location);
    });
}
//server needed to get content from
function get_server(location){
    var parts = location.split('?')[1].split('&'),
      uuid = parts[0].split('=')[1], //br-uuid=uuid 
      token = parts[1].split('=')[1], //unique token
      id = parts[2].split('=')[1], //second part of bookpath - needed later to page paths- used a LOT
      bookPath = parts[3].split('=')[1],//book specific extension path
      olHost = parts[4].split('=')[1], //probs always openlibrary.org
      olAuthUrl = parts[5].split('=')[1]; //probs always https://openlibrary.org/ia_auth/XXX
    var uuid_cookie = 'br-'+uuid+'='+uuid+';';
    var ol_cookie = 'ol-host='+olHost+';';
    var olAuthUrl_cookie = 'ol-auth-url=' + olAuthUrl+';';
    var token_cookie = uuid + '=' + token+';';

    var cookies = [uuid_cookie,ol_cookie,olAuthUrl_cookie,token_cookie]  ;

    var req = request({
        headers:{
            "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Encoding":"gzip, deflate",
            "Accept-Language": "en-US,en;q=0.8",
            "Cache-Control":"max-age=0",
            "Connection":"keep-alive",
            "Cookie":cookies.join(" "),
            "Host":"www.archive.org",
            "Referer":"https://openlibrary.org/account/loans",
            "Upgrade-Insecure-Requests":1,
        },
        url:'https://www.archive.org'+bookPath,
        method: 'GET'
    });

    req.on('response', function(res){
      var chunks = [];
      res.on('data',function(chunk){
        chunks.push(chunk);
      });
      res.on('end',function(){
        var buffer = Buffer.concat(chunks);
        zlib.gunzip(buffer, function(err, decoded){
          var page_data = decoded.toString();
          var server = page_data.match(/ia\d+/)[0];
          var item_num = page_data.match(/itemPath=\/(\d+)\/items/)[0];//not sure what itd for but its unique to books, or at least, not constant
          //so now in cookies we have all the cookies we need to get our images, 
          //in id we have the path on the server for the pages
          //and in server we have the base url we need to hit
          console.log('got cookies');
          console.log('pagenum ' +  page_num);
          download_pages(server,cookies,item_num,id);
        });
      });
    });
}
//download the pages
//example
//https://ia802604.us.archive.org/BookReader/BookReaderImages.php?zip=/16/items/latheofheavendis00legu/latheofheavendis00legu_jp2.zip&file=latheofheavendis00legu_jp2/latheofheavendis00legu_0017.jp2&scale=1&rotate=0
//https://ia802604.us.archive.org/BookReader/BookReaderImages.php?zip=/16/items/latheofheavendis00legu/latheofheavendis00legu_jp2.zip&file=latheofheavendis00legu_jp2/latheofheavendis00legu_0000.jp2&scale=1&rotate=0
function download_pages(server,cookies,item_num,path){
  console.log('https://'+server+".us.archive.org/BookReader/BookReaderJSIA.php?id="+path+'&'+item_num+'/'+path+'&server='+server+'.us.archive.org&subPrefix='+path);

 var req = request({
        encoding:'binary',
        headers:{
          "Accept-Language": "en-US,en;q=0.8",
          "Cache-Control":"max-age=0",
          "Connection":"keep-alive",
          "Cookie":cookies.join(" "),
          "Host":server+".us.archive.org",
          "Referer":"https://archive.org/stream/"+path,
          "Upgrade-Insecure-Requests":1,
      },
      method:'GET',
      url:'https://'+server+".us.archive.org/BookReader/BookReaderJSIA.php?id="+path+'&'+item_num+'/'+path+'&server='+server+'.us.archive.org&subPrefix='+path
  },function(err,res,body){
    var compressed = body.replace(/\s|\n/g, '');
    var max_pages = compressed.match(/br\.leafMap=\[.*?,(\d+)\]/)[1];

    if(!fs.existsSync(title)){
      fs.mkdirSync(title);
    }
    var status_code = 200;///gonna presume a book has at least one page
    var cover_url = "https://"+server+".us.archive.org/BookReader/BookReaderPreview.php?id="+path+'&'+item_num+'/'+path+"&server="+server+".us.archive.org&page=cover_t.jpg";//not sure if all like this 
   
    var req = request({
          encoding:'binary',
          headers:{
            "Accept-Language": "en-US,en;q=0.8",
            "Cache-Control":"max-age=0",
            "Connection":"keep-alive",
            "Cookie":cookies.join(" "),
            "Host":server+".us.archive.org",
            "Referer":"https://archive.org/stream/"+path,
            "Upgrade-Insecure-Requests":1,
        },
        method:'GET',
        url:cover_url
    },function(err,res,body){
      console.log(title);
      fs.writeFile(title+'/Cover.jpg',body,'binary',function(){
        console.log('cover get');
      });
    });
    var num = item_num.split('=')[1];
    console.log('saved page is ' + saved_page);
    if(page_num == -1){
      page_num = 0;   
    }
    else{
      page_num = saved_page;
    }
    request_control(cookies,server, num,path,page_num,max_pages);

  });

}

function request_control(cookies,server, num,path,page_num,max_pages){
    while(page_num<=max_pages*.1*tenths){
      request_page(cookies,server,num,path,page_num,max_pages);//way too many vars... 
      page_num++;   
    }
}

function request_page(cookies,server,num,path,page_num,max_pages){
  console.log('REQUESTING PAGE'+page_num);
  var page_num_padded = leftpad(page_num);
  var base_page_url = 'https://'+server+".us.archive.org/BookReader/BookReaderImages.php?zip="+num+'/'+path+'/'+path+'_jp2.zip&file='+path+'_jp2/'+path+'_'+page_num_padded+'.jp2&scale=1&rotate=0';
  //console.log(base_page_url);
  request({
    encoding:'binary',
    headers:{
      "Referer":"https://archive.org/stream/"+path,
      "Cookie":cookies.join(" ")
    },
    url:base_page_url
  },function(err,res,body){
    console.log(res.statusCode);
    status_code = res.statusCode;
    if(status_code == 200){
      saved_page = page_num;
      fs.writeFile(title+'/page'+page_num_padded+'.jpg',body,'binary',function(){
        console.log('wrote page '+page_num);
        fs.readdir(title,function(err,files){
          console.log('files in '+ files.length+' out of '+ max_pages*.1*tenths)
          if(files.length >= Math.floor(max_pages*.1*tenths) && tenths<10){//starts at 0 so +1, plus cover
            page_num++;
            tenths++;
            request_control(cookies,server,num,path,page_num,max_pages);
          }
        })
      });
    }
    else if(status_code == 403){
      console.log(403);
      get_cookies(loan);
    }
    else if(status_code == 504){
      console.log(504);
      request_page(cookies,server,num,path,page_num);
    }
  });
}
function leftpad(num){//up to 9999
    var num_str = num.toString();
    var pad = 4 - num_str.length;
    i=0;
    while(i++<pad){
      num_str = "0" + num_str;
    }
    return num_str;
  }








