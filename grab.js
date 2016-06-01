var querystring = require('querystring');
var request = require('request');
var zlib = require('zlib');
var env = require('node-env-file');
env(__dirname + '/.env');

var loginPostData = querystring.stringify({
    username: process.env.USERNAME,
    password: process.env.PASSWORD,
    redirect: "https://openlibrary.org/",
    login: "Log In"
});

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
    var user_login_cookie = res.headers['set-cookie'][0].split(' ')[0].slice(0,-1);
    get_cookies(user_login_cookie);
});

function get_cookies(user_login_cookie){
    user_login_cookie = user_login_cookie;
    var borrowPostData = querystring.stringify({
        action:"read",
        ol_host:"openlibrary.org"
    });
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
        uri:"https://openlibrary.org/books/OL24212134M/_doread/borrow",//path is gotten as action on READ ONLINE button on loan page
        body: borrowPostData,
        method:'POST'
    },
    function(err,res,body){
        get_server(res.headers.location);
    });
}

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
          download_pages(server,cookies,item_num,id);
        });
      });
    });
}

function download_pages(server,cookies,item_num,path){
  var status_code = 200;///gonna presume a book has at least one page
  var cover_url = "https://"+server+".us.archive.org/BookReader/BookReaderPreview.php?id="+path+'&'+item_num+'/'+path+"&server="+server+".us.archive.org&page=cover_t.jpg";//not sure if all like this 
  console.log(cover_url);
  // var pages_url =
  var req = request({
        headers:{
          "Accept":"image/webp,image/*,*/*;q=0.8",
          "Accept-Encoding":"gzip, deflate",
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
  });
  
  // while(status_code == 200){
  //   request({
  //     url:
  //   });
  // }
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








