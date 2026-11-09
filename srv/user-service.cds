// Any logged-in user: "who am I and which apps may I open?" (used by the launch page tiles)
@path: '/odata/v4/user'
service UserService @(requires: 'authenticated-user') {
  type Me { id : String; roles : many String; }
  function whoAmI() returns Me;
}
