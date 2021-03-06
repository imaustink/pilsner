import {
  render,
  renderFragmentFromHTMLString,
  createLiveElement,
  createLiveTextFragment,
  removeNode
} from '../src/renderer'
// These DOM helpers are needed because SkateJS doesn't implement them.
import { getElementsByTagName } from './helpers'
import { Component } from '../src/component'
import { ObservableObject } from '../src/observables'
import { PropertyBinding, nodeBindings, teardownBindings } from '../src/binding'

test('should create live text nodes in document fragment', () => {
  const scope = new ObservableObject({ bar: 'hello', qux: 'world' })
  const frag = createLiveTextFragment('foo {{bar}} baz {{qux}}', scope)

  expect(frag.textContent).toBe('foo hello baz world')

  scope.bar = 'bar'
  scope.qux = 'qux'

  expect(frag.textContent).toBe('foo bar baz qux')

  scope.bar = 'one'
  scope.qux = 'two'

  expect(frag.textContent).toBe('foo one baz two')

  teardownBindings(frag)
})

test('should create simple text node', () => {
  const frag = createLiveTextFragment('hello world')

  expect(frag.textContent).toBe('hello world')
})

test('should create native element', () => {
  const p = createLiveElement({
    tagName: 'p',
    children: [],
    attributes: []
  })

  expect(p).toBeInstanceOf(HTMLElement)
  expect(p.tagName).toBe('P')
})

test('should create custom element', () => {
  class TestComponent extends Component {
    template = ''
  }

  customElements.define('test-component', TestComponent)

  const ce = createLiveElement({
    tagName: 'test-component',
    children: [],
    attributes: []
  })

  expect(ce).toBeInstanceOf(TestComponent)
})

test('should teardown text node binding on removal', () => {
  const scope = new ObservableObject({ foo: 'bar' })
  const node = createLiveTextFragment('{{foo}}', scope).firstChild
  const binding = nodeBindings.get(node)

  expect(binding[0]).toBeInstanceOf(PropertyBinding)

  removeNode(node)

  expect(nodeBindings.get(node)).toBe(undefined)
  expect(nodeBindings.size).toBe(0)
  expect(binding[0].handlers.size).toBe(0)
})

test('should teardown child text node bindings on removal', () => {
  const scope = new ObservableObject({ foo: 'bar', baz: 'qux' })
  const node = createLiveTextFragment('{{foo}} {{baz}}', scope)

  removeNode(node)

  expect(nodeBindings.size).toBe(0)
})

test('should teardown deeply nested bindings', () => {
  const scope = new ObservableObject({ foo: 'bar', baz: 'qux' })
  const p = createLiveElement({
    tagName: 'p',
    children: [],
    attributes: []
  })
  const subP = createLiveElement({
    tagName: 'p',
    children: [],
    attributes: []
  })

  p.appendChild(createLiveTextFragment('{{foo}}', scope))
  p.appendChild(subP)
  subP.appendChild(createLiveTextFragment('{{baz}}', scope))

  expect(nodeBindings.size).toBe(2)

  teardownBindings(p)

  expect(nodeBindings.size).toBe(0)
})

test('should create a single text nodes', () => {
  const scope = new ObservableObject({ foo: 'bar' })
  const node = createLiveTextFragment('{{foo}}', scope)

  expect(node.childNodes.length).toBe(1)
  expect(node.firstChild.nodeValue).toBe('bar')

  teardownBindings(node)
})

test('should render simple fragment from HTML', () => {
  const frag = renderFragmentFromHTMLString(`<div><p>Hello World</p></div>`)

  expect(frag.firstChild.tagName).toBe('DIV')
  expect(frag.firstChild.firstChild.tagName).toBe('P')
  expect(frag.firstChild.firstChild.firstChild.nodeValue).toBe('Hello World')
})

test('should render live fragment from HTML', () => {
  const scope = new ObservableObject({ greeting: 'Hello World' })
  const frag = renderFragmentFromHTMLString(`<div><p>{{greeting}}</p></div>`, scope)

  expect(frag.firstChild.tagName).toBe('DIV')
  expect(frag.firstChild.firstChild.tagName).toBe('P')
  expect(frag.firstChild.firstChild.firstChild.nodeValue).toBe('Hello World')

  scope.greeting = 'Hello Everyone'

  expect(frag.firstChild.firstChild.firstChild.nodeValue).toBe('Hello Everyone')

  teardownBindings(frag)
})

test('should create element with live attribute', () => {
  const scope = new ObservableObject({ id: 'foo', otherThing: 'bar' })
  const div = renderFragmentFromHTMLString('<div id="{{id}}-{{otherThing}}"></div>', scope)
    .firstChild

  expect(div.getAttribute('id')).toBe('foo-bar')

  scope.id = 'bar'
  scope.otherThing = 'baz'

  expect(div.getAttribute('id')).toBe('bar-baz')

  scope.id = 'hello'
  scope.otherThing = 'world'

  expect(div.getAttribute('id')).toBe('hello-world')

  teardownBindings(div)
})

test('should bind event to handler in scope', () => {
  expect.assertions(3)
  const scope = new ObservableObject({
    handler (event) {
      expect(event).toBeInstanceOf(Event)
      expect(this).toBe(scope)
    }
  })
  const button = renderFragmentFromHTMLString('<button m-on:click="handler"></button>', scope)
    .firstChild

  button.dispatchEvent(new Event('click'))

  teardownBindings(button)

  expect(nodeBindings.size).toBe(0)
})

test('should bind event to handler in parent scope automatically', () => {
  expect.assertions(3)
  const scope = new ObservableObject({
    handler (event, scope) {
      expect(event).toBeInstanceOf(Event)
      expect(scope.$value).toBe('foo')
    },
    items: ['foo', 'bar']
  })
  const frag = renderFragmentFromHTMLString('<button m-for="items" m-on:click="handler"></button>', scope)
  const [ button ] = getElementsByTagName(frag, 'button')

  button.dispatchEvent(new Event('click'))

  teardownBindings(frag)

  expect(nodeBindings.size).toBe(0)
})

test('should conditionally render child', () => {
  const scope = new ObservableObject({ shown: true })
  const frag = renderFragmentFromHTMLString('<div m-if="shown">Hello World!</div>', scope)

  expect(frag.firstChild.nodeType).toBe(Node.ELEMENT_NODE)
  expect(frag.firstChild.textContent).toBe('Hello World!')

  scope.shown = false

  expect(frag.firstChild.nodeType).toBe(Node.TEXT_NODE)
  expect(frag.firstChild.textContent).toBe('')

  scope.shown = true

  expect(frag.firstChild.nodeType).toBe(Node.ELEMENT_NODE)
  expect(frag.firstChild.textContent).toBe('Hello World!')

  teardownBindings(frag)
})

test('should render live list from Array of Objects', () => {
  const scope = new ObservableObject({
    items: [
      {
        name: 'bar'
      },
      {
        name: 'baz'
      },
      {
        name: 'qux'
      }
    ]
  })
  const frag = renderFragmentFromHTMLString(
    '<ul><li m-for="items" id="item-{{$index}}">{{name}}</li></il>',
    scope
  )

  let nodes = getElementsByTagName(frag, 'li')
  nodes.forEach((li, i) => {
    expect(li.textContent).toBe(scope.items[i].name)
    expect(li.getAttribute('id')).toBe(`item-${i}`)
  })

  expect(nodes.length).toBe(3)

  scope.items.push({
    name: 'foo'
  })

  nodes = getElementsByTagName(frag, 'li')
  nodes.forEach((li, i) => {
    expect(li.textContent).toBe(scope.items[i].name)
    expect(li.getAttribute('id')).toBe(`item-${i}`)
  })

  expect(nodes.length).toBe(4)
})

test('should render live list from Array of Strings', () => {
  const scope = new ObservableObject({
    items: ['foo', 'bar', 'baz']
  })
  const frag = renderFragmentFromHTMLString(
    '<ul><li m-for="items">{{$value}}</li></il>',
    scope
  )

  getElementsByTagName(frag, 'li').forEach((li, i) => {
    expect(li.textContent).toBe(scope.items[i])
  })
})

test('should render live list from Object of Objects', () => {
  const scope = new ObservableObject({
    items: {
      'first': {
        name: 'foo'
      },
      'second': {
        name: 'bar'
      },
      'third': {
        name: 'baz'
      }
    }
  })
  const frag = renderFragmentFromHTMLString(
    '<ul><li m-for="items" id="{{$index}}">{{name}}</li></il>',
    scope
  )
  const keys = Object.keys(scope.items)

  getElementsByTagName(frag, 'li').forEach((li, i) => {
    expect(li.textContent).toBe(scope.items[i].name)
    expect(keys.includes(li.getAttribute('id'))).toBe(true)
  })
})

test('render template from string', () => {
  const frag = render('<p></p>', new ObservableObject())

  expect(frag.firstChild.tagName).toBe('P')
})

test('render template from script tag', () => {
  const script = document.createElement('script')
  script.appendChild(document.createTextNode('<p></p>'))
  const frag = render(script, new ObservableObject())

  expect(frag.firstChild.tagName).toBe('P')
})

test('two-way bind input value to view model', () => {
  const scope = new ObservableObject({
    message: 'foo'
  })
  const frag = render(`<input m-bind:value="message">`, scope)
  const input = frag.firstChild

  expect(input.value).toBe('foo')

  input.value = 'bar'
  input.dispatchEvent(new Event('input'))

  expect(scope.message).toBe('bar')

  scope.message = 'baz'

  expect(input.value).toBe('baz')
})
